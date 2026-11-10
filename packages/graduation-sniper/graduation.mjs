#!/usr/bin/env node
// Graduation Sniper: покупает токены перед graduation (миграцией с bonding curve на PumpSwap AMM)
//
// Стратегия: мониторит bonding curve reserves из V3 trade events.
// Когда virtual_sol_reserves приближается к порогу graduation (~85 SOL),
// покупает токен. После graduation цена обычно растёт из-за:
// - Ликвидность на PumpSwap AMM
// - Листинг на Jupiter (больше видимость)
// - FOMO от статуса "graduated"
// - Fee distribution для холдеров
//
// Использование: node bots/graduation-sniper/graduation.mjs [--dry-run]
//
// Конфиг через ENV или .env:
//   GRAD_BUY_SOL=0.1              — сумма покупки
//   GRAD_MIN_FILL_PCT=92          — минимальный % заполнения для покупки
//   GRAD_TAKE_PROFIT=1.5          — продать при 1.5x
//   GRAD_STOP_LOSS=0.7            — стоп-лосс при 0.7x
//   GRAD_TIMEOUT_SEC=300          — таймаут позиции (5 мин)
//   GRAD_MAX_POSITIONS=3          — макс. позиций
//   GRAD_COOLDOWN_SEC=30          — пауза между покупками

import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SLIPPAGE_BPS } from "../../lib/config.mjs";
import {
  PUMP_PROGRAM,
  TOKEN_2022_PROGRAM,
  TRADE_EVENT_PREFIX,
  BUY_INSTRUCTIONS,
  SELL_INSTRUCTIONS,
  CREATE_INSTRUCTIONS,
} from "../../lib/constants.mjs";
import {
  buyIx,
  calcBuyTokens,
  calcSellSol,
  getBondingCurveState,
  getPrice,
  sellIx,
} from "../../lib/pumpfun.mjs";
import { connection, sendTxWithRetry } from "../../lib/rpc.mjs";
import { buildVersionedTx, computeBudgetIxs, jitoTipIx } from "../../lib/tx.mjs";
import { loadKeypair } from "../../lib/wallet.mjs";
import { SolanaWs } from "../../lib/ws.mjs";

const BUY_SOL = Number(process.env.GRAD_BUY_SOL || 0.1);
const MIN_FILL_PCT = Number(process.env.GRAD_MIN_FILL_PCT || 92);
const TAKE_PROFIT = Number(process.env.GRAD_TAKE_PROFIT || 1.5);
const STOP_LOSS = Number(process.env.GRAD_STOP_LOSS || 0.7);
const TIMEOUT_SEC = Number(process.env.GRAD_TIMEOUT_SEC || 300);
const MAX_POSITIONS = Number(process.env.GRAD_MAX_POSITIONS || 3);
const COOLDOWN_SEC = Number(process.env.GRAD_COOLDOWN_SEC || 30);
const POLL_MS = 3000;
const DRY_RUN = process.argv.includes("--dry-run");

const VIRTUAL_SOL_AT_GRADUATION = 85_000_000_000n;

const wallet = loadKeypair();
const positions = new Map();
const watchlist = new Map();
let lastBuyTime = 0;
let totalPnl = 0;
let totalTrades = 0;
let wins = 0;

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function parseV3TradeEvent(data) {
  if (data.length < 129) return null;
  const mint = new PublicKey(data.subarray(8, 40)).toBase58();
  const solAmount = Number(data.readBigUInt64LE(40)) / 1e9;
  const tokenAmount = Number(data.readBigUInt64LE(48)) / 1e6;
  const user = new PublicKey(data.subarray(57, 89)).toBase58();
  const virtualSolReserves = data.readBigUInt64LE(97);
  const virtualTokenReserves = data.readBigUInt64LE(105);
  const realSolReserves = data.readBigUInt64LE(113);
  const realTokenReserves = data.readBigUInt64LE(121);
  return {
    mint, solAmount, tokenAmount, user,
    virtualSolReserves, virtualTokenReserves,
    realSolReserves, realTokenReserves,
  };
}

function getFillPct(virtualSolReserves) {
  return (Number(virtualSolReserves) / Number(VIRTUAL_SOL_AT_GRADUATION)) * 100;
}

async function buyToken(mint, fillPct, virtualSolReserves, virtualTokenReserves) {
  if (positions.size >= MAX_POSITIONS) return;
  if (positions.has(mint)) return;
  if (Date.now() - lastBuyTime < COOLDOWN_SEC * 1000) return;

  const mintPk = new PublicKey(mint);
  const entryPrice = Number(virtualSolReserves) / Number(virtualTokenReserves);

  log(`*** PRE-GRADUATION BUY ***`);
  log(`  mint: ${mint}`);
  log(`  fill: ${fillPct.toFixed(1)}% | price: ${entryPrice.toFixed(12)} SOL/token`);
  log(`  buying ${BUY_SOL} SOL`);

  if (DRY_RUN) {
    positions.set(mint, { entryPrice, entryTime: Date.now(), fillAtEntry: fillPct });
    lastBuyTime = Date.now();
    log(`  [DRY RUN] position tracked`);
    return;
  }

  try {
    const state = await getBondingCurveState(mintPk);
    if (!state || state.complete) {
      log(`  bonding curve already complete or unavailable`);
      return;
    }

    const expectedTokens = calcBuyTokens(state, BUY_SOL);
    const minTokens = (expectedTokens * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

    const ixs = [
      ...computeBudgetIxs(),
      buyIx(wallet.publicKey, mintPk, BUY_SOL, minTokens),
      jitoTipIx(wallet.publicKey),
    ];
    const tx = await buildVersionedTx(wallet, ixs);
    await sendTxWithRetry(tx, { skipPreflight: true });
    positions.set(mint, { entryPrice, entryTime: Date.now(), fillAtEntry: fillPct });
    lastBuyTime = Date.now();
    log(`  bought!`);
  } catch (err) {
    log(`  buy failed: ${err.message}`);
  }
}

async function checkExit(mint) {
  const pos = positions.get(mint);
  if (!pos) return;

  const mintPk = new PublicKey(mint);
  const elapsed = (Date.now() - pos.entryTime) / 1000;

  try {
    const state = await getBondingCurveState(mintPk);
    if (!state) {
      log(`  ${mint.slice(0, 12)}: bonding curve gone (graduated?), holding for AMM`);
      return;
    }

    if (state.complete) {
      log(`  ${mint.slice(0, 12)}: *** GRADUATED! *** holding for price pump`);
      return;
    }

    const currentPrice = getPrice(state);
    const pnlMult = currentPrice / pos.entryPrice;

    if (pnlMult >= TAKE_PROFIT) {
      log(`  ${mint.slice(0, 12)}: TP hit ${((pnlMult - 1) * 100).toFixed(1)}%`);
      await sellPosition(mint, mintPk, pos, pnlMult);
    } else if (pnlMult <= STOP_LOSS) {
      log(`  ${mint.slice(0, 12)}: SL hit ${((pnlMult - 1) * 100).toFixed(1)}%`);
      await sellPosition(mint, mintPk, pos, pnlMult);
    } else if (elapsed >= TIMEOUT_SEC) {
      log(`  ${mint.slice(0, 12)}: timeout ${elapsed.toFixed(0)}s, pnl=${((pnlMult - 1) * 100).toFixed(1)}%`);
      await sellPosition(mint, mintPk, pos, pnlMult);
    }
  } catch {}
}

async function sellPosition(mint, mintPk, pos, pnlMult) {
  const pnlPct = ((pnlMult - 1) * 100).toFixed(1);
  const pnlSol = BUY_SOL * (pnlMult - 1);

  if (DRY_RUN) {
    totalTrades++;
    totalPnl += pnlSol;
    if (pnlMult > 1) wins++;
    log(`  [DRY RUN] sold: ${pnlMult >= 1 ? "+" : ""}${pnlPct}% (${pnlSol >= 0 ? "+" : ""}${pnlSol.toFixed(4)} SOL)`);
    log(`  session: ${wins}W/${totalTrades - wins}L, PnL: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)} SOL`);
    positions.delete(mint);
    return;
  }

  try {
    const ata = getAssociatedTokenAddressSync(mintPk, wallet.publicKey, false, TOKEN_2022_PROGRAM);
    const info = await connection.getTokenAccountBalance(ata);
    const total = BigInt(info.value.amount);
    if (total === 0n) { positions.delete(mint); return; }

    const state = await getBondingCurveState(mintPk);
    if (!state || state.complete) {
      log(`  cannot sell on bonding curve (graduated), need PumpSwap sell`);
      positions.delete(mint);
      return;
    }

    const expectedSol = calcSellSol(state, total);
    const minSol = (expectedSol * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

    const ixs = [
      ...computeBudgetIxs(),
      sellIx(wallet.publicKey, mintPk, total, minSol),
      jitoTipIx(wallet.publicKey),
    ];
    const tx = await buildVersionedTx(wallet, ixs);
    await sendTxWithRetry(tx, { skipPreflight: true });

    totalTrades++;
    totalPnl += pnlSol;
    if (pnlMult > 1) wins++;
    log(`  sold: ${pnlMult >= 1 ? "+" : ""}${pnlPct}% (${pnlSol >= 0 ? "+" : ""}${pnlSol.toFixed(4)} SOL)`);
    log(`  session: ${wins}W/${totalTrades - wins}L, PnL: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)} SOL`);
    positions.delete(mint);
  } catch (err) {
    log(`  sell failed: ${err.message}`);
  }
}

// Position monitoring loop
async function monitorPositions() {
  for (const [mint] of positions) {
    await checkExit(mint);
  }
}
setInterval(monitorPositions, POLL_MS);

// Main
log("=== GRADUATION SNIPER ===");
log(`Wallet: ${wallet.publicKey.toBase58()}`);
log(`Config: buy=${BUY_SOL} SOL, fill>=${MIN_FILL_PCT}%, TP=${TAKE_PROFIT}x, SL=${STOP_LOSS}x, timeout=${TIMEOUT_SEC}s`);
log(`Max positions: ${MAX_POSITIONS}, cooldown: ${COOLDOWN_SEC}s`);
if (DRY_RUN) log("MODE: DRY RUN (no real transactions)");

const ws = new SolanaWs();
await ws.connect();

ws.subscribeLogs(PUMP_PROGRAM.toBase58(), (result) => {
  const { value } = result;
  if (!value?.logs) return;

  const lastLog = value.logs[value.logs.length - 1] || "";
  if (!lastLog.includes("success")) return;

  let isBuy = false;
  for (const l of value.logs) {
    const m = l.match(/Instruction: (\w+)/);
    if (m && BUY_INSTRUCTIONS.has(m[1])) { isBuy = true; break; }
  }
  if (!isBuy) return;

  for (const l of value.logs) {
    if (!l.startsWith("Program data: ")) continue;
    const data = Buffer.from(l.slice(14), "base64");
    if (data.length < 129 || !data.subarray(0, 8).equals(TRADE_EVENT_PREFIX)) continue;

    try {
      const ev = parseV3TradeEvent(data);
      if (!ev) continue;

      const fillPct = getFillPct(ev.virtualSolReserves);

      if (fillPct >= MIN_FILL_PCT && fillPct < 100) {
        const prev = watchlist.get(ev.mint);
        if (!prev || fillPct > prev.fillPct) {
          watchlist.set(ev.mint, { fillPct, ts: Date.now() });
          log(`WATCHLIST: ${ev.mint.slice(0, 12)} fill=${fillPct.toFixed(1)}% vSol=${(Number(ev.virtualSolReserves) / 1e9).toFixed(2)}`);
        }

        if (!positions.has(ev.mint)) {
          buyToken(ev.mint, fillPct, ev.virtualSolReserves, ev.virtualTokenReserves);
        }
      }
    } catch {}
    break;
  }
});

log("\nListening for near-graduation tokens...\n");

// Cleanup old watchlist entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [mint, info] of watchlist) {
    if (now - info.ts > 600_000) watchlist.delete(mint);
  }
}, 60_000);

process.on("SIGINT", () => {
  log("\nStopping.");
  log(`  Session: ${totalTrades} trades, ${wins}W/${totalTrades - wins}L`);
  log(`  PnL: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)} SOL`);
  log(`  Watchlist: ${watchlist.size} tokens tracked`);
  log(`  Open positions: ${positions.size}`);
  for (const [mint, pos] of positions) {
    log(`    ${mint.slice(0, 12)} fill@entry=${pos.fillAtEntry.toFixed(1)}%`);
  }
  ws.close();
  process.exit(0);
});

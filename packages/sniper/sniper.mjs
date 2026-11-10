#!/usr/bin/env node
// Снайпер: покупает новые токены на pump.fun при появлении BondingCurveV3,
// продаёт по take-profit / stop-loss / timeout (V3 API)
//
// Использование: node bots/sniper/sniper.mjs [--dry-run]
//
// Конфиг через ENV или .env:
//   SNIPER_BUY_SOL=0.1          — сколько SOL на покупку
//   SNIPER_TAKE_PROFIT=2.0      — продать при 2x
//   SNIPER_STOP_LOSS=0.5        — продать если цена упала до 0.5x
//   SNIPER_TIMEOUT_SEC=120      — продать через 120 секунд
//   SNIPER_MAX_POSITIONS=3      — максимум одновременных позиций
//   SNIPER_MIN_DEV_BUY=0.5      — минимальная покупка dev'а (SOL)
//   SNIPER_COOLDOWN_SEC=10      — пауза между покупками

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

// Config
const BUY_SOL = Number(process.env.SNIPER_BUY_SOL || 0.1);
const TAKE_PROFIT = Number(process.env.SNIPER_TAKE_PROFIT || 2.0);
const STOP_LOSS = Number(process.env.SNIPER_STOP_LOSS || 0.5);
const TIMEOUT_SEC = Number(process.env.SNIPER_TIMEOUT_SEC || 120);
const MAX_POSITIONS = Number(process.env.SNIPER_MAX_POSITIONS || 3);
const MIN_DEV_BUY = Number(process.env.SNIPER_MIN_DEV_BUY || 0);
const COOLDOWN_SEC = Number(process.env.SNIPER_COOLDOWN_SEC || 10);
const POLL_MS = 2000;
const DRY_RUN = process.argv.includes("--dry-run");

let totalPnl = 0;
let totalTrades = 0;
let wins = 0;

const wallet = loadKeypair();
const positions = new Map(); // mint → { tokens, entryPrice, entryTime }
let lastBuyTime = 0;

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function parseV3TradeEvent(data) {
  if (data.length < 89) return null;
  const mint = new PublicKey(data.subarray(8, 40)).toBase58();
  const solAmount = Number(data.readBigUInt64LE(40)) / 1e9;
  const tokenAmount = Number(data.readBigUInt64LE(48)) / 1e6;
  const user = new PublicKey(data.subarray(57, 89)).toBase58();
  let virtualSolReserves, virtualTokenReserves;
  if (data.length >= 113) {
    virtualSolReserves = data.readBigUInt64LE(97);
    virtualTokenReserves = data.readBigUInt64LE(105);
  }
  return { mint, solAmount, tokenAmount, user, virtualSolReserves, virtualTokenReserves };
}

function parseLogEvents(logs) {
  let isBuy = false, isCreate = false;
  for (const line of logs) {
    const m = line.match(/Instruction: (\w+)/);
    if (!m) continue;
    if (BUY_INSTRUCTIONS.has(m[1])) isBuy = true;
    if (CREATE_INSTRUCTIONS.has(m[1])) isCreate = true;
  }

  const events = [];
  for (const line of logs) {
    if (!line.startsWith("Program data: ")) continue;
    const raw = Buffer.from(line.slice(14), "base64");
    if (raw.length < 8 || !raw.subarray(0, 8).equals(TRADE_EVENT_PREFIX)) continue;

    try {
      const parsed = parseV3TradeEvent(raw);
      if (!parsed) continue;

      if (isCreate) {
        events.push({ type: "create", mint: parsed.mint, creator: parsed.user });
      }
      if (isBuy) {
        events.push({ type: "trade", isBuy: true, ...parsed });
      }
    } catch {}
  }
  return events;
}

async function executeBuy(mint) {
  const mintPk = new PublicKey(mint);
  const state = await getBondingCurveState(mintPk);
  if (!state || state.complete) {
    log(`  skip: bonding curve unavailable`);
    return;
  }

  const entryPrice = getPrice(state);
  const expectedTokens = calcBuyTokens(state, BUY_SOL);
  const minTokens = (expectedTokens * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

  log(`  buying ${BUY_SOL} SOL -> ~${(Number(expectedTokens) / 1e6).toFixed(0)} tokens`);
  log(`  entry price: ${entryPrice.toFixed(12)} SOL/tok`);

  if (DRY_RUN) {
    positions.set(mint, { tokens: expectedTokens, entryPrice, entryTime: Date.now() });
    lastBuyTime = Date.now();
    log(`  [DRY RUN] would buy — position tracked`);
    return;
  }

  const ixs = [
    ...computeBudgetIxs(),
    buyIx(wallet.publicKey, mintPk, BUY_SOL, minTokens),
    jitoTipIx(wallet.publicKey),
  ];

  try {
    const tx = await buildVersionedTx(wallet, ixs);
    await sendTxWithRetry(tx, { skipPreflight: true });
    positions.set(mint, { tokens: expectedTokens, entryPrice, entryTime: Date.now() });
    lastBuyTime = Date.now();
    log(`  position opened`);
  } catch (err) {
    log(`  buy failed: ${err.message}`);
  }
}

async function executeSell(mint, reason) {
  const pos = positions.get(mint);
  if (!pos) return;

  const mintPk = new PublicKey(mint);
  log(`  selling ${mint.slice(0, 8)}... (${reason})`);

  if (DRY_RUN) {
    const state = await getBondingCurveState(mintPk);
    if (state) {
      const sellPrice = getPrice(state);
      const pnlPct = ((sellPrice / pos.entryPrice) - 1) * 100;
      const holdSec = ((Date.now() - pos.entryTime) / 1000).toFixed(0);
      totalTrades++;
      if (pnlPct > 0) wins++;
      log(`  [DRY RUN] would sell: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%, held ${holdSec}s`);
      log(`  session: ${totalTrades} trades, ${wins}W/${totalTrades - wins}L`);
    }
    positions.delete(mint);
    return;
  }

  try {
    const ata = getAssociatedTokenAddressSync(mintPk, wallet.publicKey, false, TOKEN_2022_PROGRAM);
    const info = await connection.getTokenAccountBalance(ata);
    const tokenAmount = BigInt(info.value.amount);

    if (tokenAmount === 0n) {
      log(`  no tokens in wallet`);
      positions.delete(mint);
      return;
    }

    const state = await getBondingCurveState(mintPk);
    if (!state || state.complete) {
      log(`  bonding curve complete, cannot sell via pump.fun`);
      positions.delete(mint);
      return;
    }

    const expectedSol = calcSellSol(state, tokenAmount);
    const minSol = (expectedSol * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

    const ixs = [
      ...computeBudgetIxs(),
      sellIx(wallet.publicKey, mintPk, tokenAmount, minSol),
      jitoTipIx(wallet.publicKey),
    ];

    const tx = await buildVersionedTx(wallet, ixs);
    await sendTxWithRetry(tx, { skipPreflight: true });

    const sellPrice = getPrice(state);
    const pnlPct = ((sellPrice / pos.entryPrice) - 1) * 100;
    const pnlSol = Number(expectedSol) / 1e9 - BUY_SOL;
    const holdSec = ((Date.now() - pos.entryTime) / 1000).toFixed(0);
    totalPnl += pnlSol;
    totalTrades++;
    if (pnlSol > 0) wins++;
    log(`  sold: ${pnlPct > 0 ? "+" : ""}${pnlPct.toFixed(1)}% (${pnlSol >= 0 ? "+" : ""}${pnlSol.toFixed(4)} SOL), held ${holdSec}s`);
    log(`  session: ${totalTrades} trades, ${wins}W/${totalTrades - wins}L, PnL: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)} SOL`);
    positions.delete(mint);
  } catch (err) {
    log(`  sell failed: ${err.message}`);
  }
}

async function checkPositions() {
  for (const [mint, pos] of positions) {
    try {
      const mintPk = new PublicKey(mint);
      const state = await getBondingCurveState(mintPk);
      if (!state) {
        await executeSell(mint, "bonding curve gone");
        continue;
      }

      const currentPrice = getPrice(state);
      const ratio = currentPrice / pos.entryPrice;
      const holdSec = (Date.now() - pos.entryTime) / 1000;

      if (ratio >= TAKE_PROFIT) {
        await executeSell(mint, `take-profit ${ratio.toFixed(1)}x`);
      } else if (ratio <= STOP_LOSS) {
        await executeSell(mint, `stop-loss ${ratio.toFixed(2)}x`);
      } else if (holdSec >= TIMEOUT_SEC) {
        await executeSell(mint, `timeout ${holdSec.toFixed(0)}s`);
      }
    } catch (err) {
      log(`  check error ${mint.slice(0, 8)}: ${err.message}`);
    }
  }
}

// Main loop
log("=== SNIPER BOT (V3) ===");
log(`Wallet: ${wallet.publicKey.toBase58()}`);
log(`Config: buy=${BUY_SOL} SOL, TP=${TAKE_PROFIT}x, SL=${STOP_LOSS}x, timeout=${TIMEOUT_SEC}s`);
log(`Max positions: ${MAX_POSITIONS}, cooldown: ${COOLDOWN_SEC}s`);
if (DRY_RUN) log(`MODE: DRY RUN (no real transactions)`);
if (MIN_DEV_BUY) log(`Filter: dev buy >= ${MIN_DEV_BUY} SOL`);

const ws = new SolanaWs();
await ws.connect();

ws.subscribeLogs(PUMP_PROGRAM.toBase58(), async (result) => {
  const { value } = result;
  if (!value?.logs) return;

  const lastLog = value.logs[value.logs.length - 1] || "";
  if (!lastLog.includes("success")) return;

  const events = parseLogEvents(value.logs);
  const creates = events.filter((e) => e.type === "create");

  for (const create of creates) {
    if (positions.size >= MAX_POSITIONS) continue;
    if (Date.now() - lastBuyTime < COOLDOWN_SEC * 1000) continue;
    if (positions.has(create.mint)) continue;

    if (MIN_DEV_BUY) {
      const devTrade = events.find(
        (e) => e.type === "trade" && e.isBuy && e.mint === create.mint && e.user === create.creator,
      );
      if (!devTrade || devTrade.solAmount < MIN_DEV_BUY) {
        log(`skip: dev buy ${devTrade?.solAmount?.toFixed(3) || 0} < ${MIN_DEV_BUY}`);
        continue;
      }
    }

    log(`\nSNIPING: ${create.mint}`);
    log(`  creator: ${create.creator}`);

    await executeBuy(create.mint);
  }
});

// Price monitor interval
setInterval(checkPositions, POLL_MS);

log("\nListening for new tokens...\n");

process.on("SIGINT", () => {
  log(`\nStopping. Open positions: ${positions.size}`);
  for (const [mint, pos] of positions) {
    log(`  ${mint.slice(0, 12)}: entry ${pos.entryPrice.toFixed(12)}`);
  }
  ws.close();
  process.exit(0);
});

#!/usr/bin/env node
// Копи-трейдер: следит за кошельками успешных трейдеров и повторяет их сделки (V3 API)
//
// Использование: node bots/copy-trader/watcher.mjs [--dry-run]
//
// Конфиг через ENV или .env:
//   COPY_TARGETS=addr1,addr2,...  — кошельки для копирования
//   COPY_BUY_SOL=0.05            — сумма покупки (фиксированная)
//   COPY_SELL_PCT=100             — процент продажи при продаже целью
//   COPY_MAX_POSITIONS=5          — максимум одновременных позиций

import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SLIPPAGE_BPS } from "../../lib/config.mjs";
import {
  PUMP_PROGRAM,
  TOKEN_2022_PROGRAM,
  TRADE_EVENT_PREFIX,
  BUY_INSTRUCTIONS,
  SELL_INSTRUCTIONS,
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

const BUY_SOL = Number(process.env.COPY_BUY_SOL || 0.05);
const SELL_PCT = Number(process.env.COPY_SELL_PCT || 100);
const MAX_POSITIONS = Number(process.env.COPY_MAX_POSITIONS || 5);
const TARGETS = (process.env.COPY_TARGETS || "").split(",").filter(Boolean);
const DRY_RUN = process.argv.includes("--dry-run");

let totalPnl = 0;
let totalTrades = 0;

if (!TARGETS.length) {
  console.log("Set COPY_TARGETS=addr1,addr2,... in .env");
  process.exit(1);
}

const wallet = loadKeypair();
const targetSet = new Set(TARGETS);
const positions = new Map(); // mint → { entryPrice, entryTime, copiedFrom }
const recentTxs = new Set(); // dedup

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function parseV3TradeEvent(data) {
  if (data.length < 89) return null;
  const mint = new PublicKey(data.subarray(8, 40)).toBase58();
  const solAmount = Number(data.readBigUInt64LE(40)) / 1e9;
  const tokenAmount = Number(data.readBigUInt64LE(48)) / 1e6;
  const user = new PublicKey(data.subarray(57, 89)).toBase58();
  return { mint, solAmount, tokenAmount, user };
}

function parseTradeEvents(logs) {
  let isBuy = false, isSell = false;
  for (const line of logs) {
    const m = line.match(/Instruction: (\w+)/);
    if (!m) continue;
    if (BUY_INSTRUCTIONS.has(m[1])) isBuy = true;
    if (SELL_INSTRUCTIONS.has(m[1])) isSell = true;
  }

  const events = [];
  for (const line of logs) {
    if (!line.startsWith("Program data: ")) continue;
    const raw = Buffer.from(line.slice(14), "base64");
    if (raw.length < 8 || !raw.subarray(0, 8).equals(TRADE_EVENT_PREFIX)) continue;

    try {
      const parsed = parseV3TradeEvent(raw);
      if (!parsed) continue;
      events.push({ ...parsed, isBuy: isBuy && !isSell });
    } catch {}
  }
  return events;
}

async function copyBuy(mint, copiedFrom) {
  if (positions.size >= MAX_POSITIONS) return;
  if (positions.has(mint)) return;

  const mintPk = new PublicKey(mint);
  const state = await getBondingCurveState(mintPk);
  if (!state || state.complete) return;

  const entryPrice = getPrice(state);
  const expectedTokens = calcBuyTokens(state, BUY_SOL);
  const minTokens = (expectedTokens * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

  log(`COPY BUY from ${copiedFrom.slice(0, 8)}...`);
  log(`  mint: ${mint.slice(0, 12)}... | ${BUY_SOL} SOL -> ~${(Number(expectedTokens) / 1e6).toFixed(0)} tokens`);

  if (DRY_RUN) {
    positions.set(mint, { entryPrice, entryTime: Date.now(), copiedFrom });
    log(`  [DRY RUN] tracked`);
    return;
  }

  try {
    const ixs = [
      ...computeBudgetIxs(),
      buyIx(wallet.publicKey, mintPk, BUY_SOL, minTokens),
      jitoTipIx(wallet.publicKey),
    ];
    const tx = await buildVersionedTx(wallet, ixs);
    await sendTxWithRetry(tx, { skipPreflight: true });
    positions.set(mint, { entryPrice, entryTime: Date.now(), copiedFrom });
    log(`  copied`);
  } catch (err) {
    log(`  copy buy failed: ${err.message}`);
  }
}

async function copySell(mint, copiedFrom) {
  const pos = positions.get(mint);
  if (!pos) return;

  const mintPk = new PublicKey(mint);
  log(`COPY SELL from ${copiedFrom.slice(0, 8)}...`);

  if (DRY_RUN) {
    const state = await getBondingCurveState(mintPk);
    if (state) {
      const sellPrice = getPrice(state);
      const pnlPct = ((sellPrice / pos.entryPrice) - 1) * 100;
      totalTrades++;
      log(`  [DRY RUN] would sell: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`);
    }
    positions.delete(mint);
    return;
  }

  try {
    const ata = getAssociatedTokenAddressSync(mintPk, wallet.publicKey, false, TOKEN_2022_PROGRAM);
    const info = await connection.getTokenAccountBalance(ata);
    const total = BigInt(info.value.amount);
    if (total === 0n) {
      positions.delete(mint);
      return;
    }

    const sellAmount = SELL_PCT >= 100 ? total : (total * BigInt(SELL_PCT)) / 100n;
    const state = await getBondingCurveState(mintPk);
    if (!state || state.complete) {
      log(`  bonding curve unavailable`);
      positions.delete(mint);
      return;
    }

    const expectedSol = calcSellSol(state, sellAmount);
    const minSol = (expectedSol * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

    const ixs = [
      ...computeBudgetIxs(),
      sellIx(wallet.publicKey, mintPk, sellAmount, minSol),
      jitoTipIx(wallet.publicKey),
    ];
    const tx = await buildVersionedTx(wallet, ixs);
    await sendTxWithRetry(tx, { skipPreflight: true });

    const sellPrice = getPrice(state);
    const pnlPct = ((sellPrice / pos.entryPrice) - 1) * 100;
    const pnlSol = Number(expectedSol) / 1e9 - BUY_SOL;
    totalPnl += pnlSol;
    totalTrades++;
    log(`  sold: ${pnlPct > 0 ? "+" : ""}${pnlPct.toFixed(1)}% (${pnlSol >= 0 ? "+" : ""}${pnlSol.toFixed(4)} SOL)`);
    log(`  session: ${totalTrades} trades, PnL: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)} SOL`);
    if (SELL_PCT >= 100) positions.delete(mint);
  } catch (err) {
    log(`  copy sell failed: ${err.message}`);
  }
}

// Main
log("=== COPY TRADER (V3) ===");
log(`Wallet: ${wallet.publicKey.toBase58()}`);
log(`Targets: ${TARGETS.map((t) => t.slice(0, 12) + "...").join(", ")}`);
log(`Config: buy=${BUY_SOL} SOL, sell=${SELL_PCT}%, max=${MAX_POSITIONS} positions`);
if (DRY_RUN) log(`MODE: DRY RUN (no real transactions)`);

const ws = new SolanaWs();
await ws.connect();

for (const target of TARGETS) {
  ws.subscribeLogs(target, async (result) => {
    const { value } = result;
    if (!value?.logs) return;

    const lastLog = value.logs[value.logs.length - 1] || "";
    if (!lastLog.includes("success")) return;

    const hasPump = value.logs.some((l) => l.includes(PUMP_PROGRAM.toBase58()));
    if (!hasPump) return;

    const sig = value.signature;
    if (recentTxs.has(sig)) return;
    recentTxs.add(sig);
    if (recentTxs.size > 10000) {
      const iter = recentTxs.values();
      for (let i = 0; i < 5000; i++) recentTxs.delete(iter.next().value);
    }

    const trades = parseTradeEvents(value.logs);
    for (const trade of trades) {
      if (trade.isBuy) {
        await copyBuy(trade.mint, target);
      } else {
        await copySell(trade.mint, target);
      }
    }
  });
  log(`Subscribed to ${target.slice(0, 12)}...`);
}

log("\nListening for target wallet trades...\n");

process.on("SIGINT", () => {
  log(`\nStopping.`);
  log(`  Session: ${totalTrades} trades, PnL: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)} SOL`);
  log(`  Open positions: ${positions.size}`);
  for (const [mint, pos] of positions) {
    log(`  ${mint.slice(0, 12)} (copied from ${pos.copiedFrom.slice(0, 8)})`);
  }
  ws.close();
  process.exit(0);
});

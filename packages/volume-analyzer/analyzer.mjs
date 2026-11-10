#!/usr/bin/env node
// Volume Analyzer: анализирует кошелёк или токен для определения стратегии
//
// Использование:
//   node bots/volume-analyzer/analyzer.mjs wallet <address>  — анализ кошелька
//   node bots/volume-analyzer/analyzer.mjs token <mint>      — анализ токена
//
// Определяет: тип стратегии, multi-wallet операции, bundled txs,
// координированные exits, wash trading indicators

import { PublicKey } from "@solana/web3.js";
import { connection } from "../../lib/rpc.mjs";
import {
  PUMP_PROGRAM,
  TRADE_EVENT_PREFIX,
  CREATE_EVENT_PREFIX,
} from "../../lib/constants.mjs";

const [, , mode, address] = process.argv;

if (!mode || !address || !["wallet", "token"].includes(mode)) {
  console.log("Usage:");
  console.log("  node analyzer.mjs wallet <address>  — analyze wallet strategy");
  console.log("  node analyzer.mjs token <mint>       — analyze token traders");
  process.exit(1);
}

function log(msg) {
  console.log(msg);
}

function parseTradeEvent(data) {
  if (data.length < 113) return null;
  if (!data.subarray(0, 8).equals(TRADE_EVENT_PREFIX)) return null;
  try {
    let off = 8;
    const mint = new PublicKey(data.subarray(off, off + 32)).toBase58(); off += 32;
    const solAmount = Number(data.readBigUInt64LE(off)) / 1e9; off += 8;
    const tokenAmount = Number(data.readBigUInt64LE(off)) / 1e6; off += 8;
    const isBuy = data[off] === 1; off += 1;
    const user = new PublicKey(data.subarray(off, off + 32)).toBase58();
    return { mint, solAmount, tokenAmount, isBuy, user };
  } catch { return null; }
}

function parseCreateEvent(data) {
  if (data.length < 40) return null;
  if (!data.subarray(0, 8).equals(CREATE_EVENT_PREFIX)) return null;
  try {
    let off = 8;
    const nameLen = data.readUInt32LE(off); off += 4;
    const name = data.subarray(off, off + nameLen).toString("utf8"); off += nameLen;
    const symLen = data.readUInt32LE(off); off += 4;
    const symbol = data.subarray(off, off + symLen).toString("utf8"); off += symLen;
    const uriLen = data.readUInt32LE(off); off += 4 + uriLen;
    const mint = new PublicKey(data.subarray(off, off + 32)).toBase58(); off += 32;
    const creator = new PublicKey(data.subarray(off, off + 32)).toBase58();
    return { name, symbol, mint, creator };
  } catch { return null; }
}

async function fetchTxDetails(sig) {
  try {
    const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 1 });
    if (!tx) return null;

    const msg = tx.transaction.message;
    const keys = msg.staticAccountKeys?.map(k => k.toBase58()) ||
                 msg.accountKeys?.map(k => k.toBase58()) || [];
    const meta = tx.meta;
    const logs = meta?.logMessages || [];

    const events = [];
    for (const line of logs) {
      if (!line.startsWith("Program data: ")) continue;
      const raw = Buffer.from(line.slice(14), "base64");
      const trade = parseTradeEvent(raw);
      if (trade) events.push({ type: "trade", ...trade });
      const create = parseCreateEvent(raw);
      if (create) events.push({ type: "create", ...create });
    }

    const KNOWN = new Set([
      "11111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "ComputeBudget111111111111111111111111111111",
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    ]);

    const programs = new Set();
    const ixCount = msg.compiledInstructions?.length || msg.instructions?.length || 0;
    for (let i = 0; i < ixCount; i++) {
      const ix = msg.compiledInstructions?.[i] || msg.instructions?.[i];
      if (ix.programIdIndex < keys.length) programs.add(keys[ix.programIdIndex]);
    }
    if (meta?.innerInstructions) {
      for (const inner of meta.innerInstructions) {
        for (const ix of inner.instructions) {
          if (ix.programIdIndex < keys.length) programs.add(keys[ix.programIdIndex]);
        }
      }
    }

    let cuPrice = 0;
    for (let i = 0; i < ixCount; i++) {
      const ix = msg.compiledInstructions?.[i] || msg.instructions?.[i];
      if (keys[ix.programIdIndex] === "ComputeBudget111111111111111111111111111111") {
        const data = ix.data instanceof Uint8Array ? ix.data : Buffer.from(ix.data, "base64");
        if (data[0] === 3 && data.length >= 9) cuPrice = Number(Buffer.from(data).readBigUInt64LE(1));
      }
    }

    const tips = [];
    if (meta?.innerInstructions) {
      for (const inner of meta.innerInstructions) {
        for (const ix of inner.instructions) {
          if (keys[ix.programIdIndex] === "11111111111111111111111111111111") {
            const data = ix.data instanceof Uint8Array ? ix.data : Buffer.from(ix.data, "base64");
            if (data[0] === 2 && data.length >= 12) {
              const lamports = Number(Buffer.from(data).readBigUInt64LE(4));
              if (lamports > 1000 && lamports < 1e9) {
                tips.push({ to: keys[ix.accounts[1]], sol: lamports / 1e9 });
              }
            }
          }
        }
      }
    }

    return {
      slot: tx.slot,
      time: tx.blockTime,
      events,
      customPrograms: [...programs].filter(p => !KNOWN.has(p)),
      cuPrice,
      tips,
      signers: keys.slice(0, msg.header?.numRequiredSignatures || 1),
    };
  } catch { return null; }
}

async function analyzeWallet(addr) {
  log(`\n${"=".repeat(60)}`);
  log(`WALLET ANALYSIS: ${addr}`);
  log("=".repeat(60));

  const pk = new PublicKey(addr);
  const sigs = await connection.getSignaturesForAddress(pk, { limit: 50 });
  log(`\nTransactions found: ${sigs.length}`);
  log(`  Successful: ${sigs.filter(s => !s.err).length}`);
  log(`  Failed: ${sigs.filter(s => s.err).length}`);

  const errorRate = sigs.filter(s => s.err).length / sigs.length;
  if (errorRate > 0.5) {
    log(`\n⚠️  High error rate: ${(errorRate * 100).toFixed(0)}% — likely brute-force strategy`);
  }

  const trades = [];
  const programs = new Map();
  const tipDests = new Map();
  const cuPrices = [];

  let fetched = 0;
  for (const sig of sigs) {
    if (sig.err) continue;
    if (fetched >= 15) break;
    const details = await fetchTxDetails(sig.signature);
    fetched++;
    if (!details) continue;

    for (const ev of details.events) {
      if (ev.type === "trade") trades.push({ ...ev, slot: details.slot, time: details.time });
    }
    for (const p of details.customPrograms) {
      programs.set(p, (programs.get(p) || 0) + 1);
    }
    for (const tip of details.tips) {
      tipDests.set(tip.to.slice(0, 12), (tipDests.get(tip.to.slice(0, 12)) || 0) + 1);
    }
    if (details.cuPrice) cuPrices.push(details.cuPrice);
  }

  // Strategy classification
  log("\n--- STRATEGY CLASSIFICATION ---");

  const buys = trades.filter(t => t.isBuy && t.user === addr);
  const sells = trades.filter(t => t.isBuy === false && t.user === addr);
  const mints = new Set(trades.map(t => t.mint));
  const hasCustomProg = programs.size > 0;
  const medCU = cuPrices.length ? cuPrices.sort((a, b) => a - b)[Math.floor(cuPrices.length / 2)] : 0;
  const solIn = buys.reduce((s, t) => s + t.solAmount, 0);
  const solOut = sells.reduce((s, t) => s + t.solAmount, 0);
  const pnl = solOut - solIn;

  log(`  Buys: ${buys.length}, Sells: ${sells.length}`);
  log(`  SOL in: ${solIn.toFixed(4)}, SOL out: ${solOut.toFixed(4)}`);
  log(`  PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} SOL`);
  log(`  Unique mints: ${mints.size}`);
  log(`  Median CU price: ${medCU.toLocaleString()}`);
  log(`  Error rate: ${(errorRate * 100).toFixed(0)}%`);

  if (programs.size) {
    log(`\n  Custom programs:`);
    for (const [prog, count] of [...programs.entries()].sort((a, b) => b[1] - a[1])) {
      log(`    ${prog.slice(0, 20)}… (${count}x)`);
    }
  }

  if (tipDests.size) {
    log(`\n  Tip destinations:`);
    for (const [dest, count] of [...tipDests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      log(`    ${dest}… (${count}x)`);
    }
  }

  // Classification logic
  let strategy;
  if (errorRate > 0.8) {
    strategy = "BRUTE_FORCE — спамит транзакциями, >80% фейлятся";
  } else if (buys.length === 0 && sells.length > 0) {
    strategy = "SELL_ONLY — вероятно pre-loaded через другой кошелёк/bundle";
  } else if (sells.length === 0 && buys.length > 0) {
    strategy = "BUY_ONLY — holding или exit через другой DEX/кошелёк";
  } else if (hasCustomProg && programs.size === 1) {
    const prog = [...programs.keys()][0];
    strategy = `CUSTOM_BOT — использует собственную программу ${prog.slice(0, 16)}…`;
  } else if (hasCustomProg) {
    strategy = "MULTI_PROGRAM — несколько кастомных программ";
  } else if (medCU >= 10000000) {
    strategy = "SLOT0_SNIPER — высокий CU priority для slot-0 entry";
  } else if (medCU === 0 && buys.length + sells.length >= 3) {
    strategy = "DIRECT_HIGHFREQ — нет CU, приоритет через bundle/landing provider";
  } else {
    strategy = "DIRECT_TRADER — стандартный прямой трейдер";
  }

  log(`\n  >>> STRATEGY: ${strategy}`);

  // Trade timeline
  if (trades.length) {
    log("\n--- RECENT TRADES ---");
    for (const t of trades.slice(0, 10)) {
      const time = t.time ? new Date(t.time * 1000).toISOString().slice(11, 19) : "?";
      log(`  ${time} | ${t.isBuy ? "BUY " : "SELL"} | ${t.solAmount.toFixed(4)} SOL | ${t.mint.slice(0, 12)}…`);
    }
  }
}

async function analyzeToken(mint) {
  log(`\n${"=".repeat(60)}`);
  log(`TOKEN ANALYSIS: ${mint}`);
  log("=".repeat(60));

  const pk = new PublicKey(mint);
  const sigs = await connection.getSignaturesForAddress(pk, { limit: 100 });
  log(`\nTransactions found: ${sigs.length}`);

  const traders = new Map();
  const timeline = [];

  let fetched = 0;
  for (const sig of sigs) {
    if (sig.err) continue;
    if (fetched >= 30) break;
    const details = await fetchTxDetails(sig.signature);
    fetched++;
    if (!details) continue;

    for (const ev of details.events) {
      if (ev.type === "trade") {
        const key = ev.user;
        if (!traders.has(key)) {
          traders.set(key, { buys: 0, sells: 0, solIn: 0, solOut: 0, firstSlot: details.slot, programs: new Set() });
        }
        const t = traders.get(key);
        if (ev.isBuy) { t.buys++; t.solIn += ev.solAmount; }
        else { t.sells++; t.solOut += ev.solAmount; }
        for (const p of details.customPrograms) t.programs.add(p);

        timeline.push({
          time: details.time,
          slot: details.slot,
          user: ev.user,
          isBuy: ev.isBuy,
          sol: ev.solAmount,
          programs: details.customPrograms,
        });
      }
      if (ev.type === "create") {
        log(`\n  Creator: ${ev.creator}`);
        log(`  Name: ${ev.name} (${ev.symbol})`);
      }
    }
  }

  log(`  Unique traders: ${traders.size}`);

  // Sort by PnL
  const sorted = [...traders.entries()]
    .map(([addr, t]) => ({ addr, ...t, pnl: t.solOut - t.solIn }))
    .sort((a, b) => b.pnl - a.pnl);

  log("\n--- TOP TRADERS BY PNL ---");
  for (const t of sorted.slice(0, 15)) {
    const progs = t.programs.size ? [...t.programs].map(p => p.slice(0, 12)).join(",") : "direct";
    log(`  ${t.addr.slice(0, 16)} | B:${t.buys} S:${t.sells} | PnL:${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(4)} | ${progs}`);
  }

  // Detect suspicious patterns
  log("\n--- PATTERN DETECTION ---");

  // 1. Bundled transactions (same slot as first trade)
  const firstSlot = Math.min(...timeline.map(t => t.slot));
  const sameSlot = timeline.filter(t => t.slot === firstSlot);
  if (sameSlot.length > 1) {
    log(`  ⚠️  ${sameSlot.length} trades in slot-0 (possible bundle):`);
    for (const t of sameSlot) {
      log(`    ${t.user.slice(0, 12)} ${t.isBuy ? "BUY" : "SELL"} ${t.sol.toFixed(4)} SOL`);
    }
  }

  // 2. Sell-only wallets
  const sellOnly = sorted.filter(t => t.buys === 0 && t.sells > 0);
  if (sellOnly.length) {
    log(`\n  ⚠️  ${sellOnly.length} sell-only wallets (pre-loaded positions):`);
    for (const t of sellOnly.slice(0, 5)) {
      log(`    ${t.addr.slice(0, 16)} → ${t.solOut.toFixed(4)} SOL out`);
    }
  }

  // 3. Rapid buy-sell (wash trading indicator)
  const rapidTrades = [];
  for (const [addr, t] of traders) {
    if (t.buys > 0 && t.sells > 0) {
      const userTrades = timeline.filter(x => x.user === addr).sort((a, b) => a.slot - b.slot);
      for (let i = 1; i < userTrades.length; i++) {
        const gap = userTrades[i].slot - userTrades[i - 1].slot;
        if (gap <= 2 && userTrades[i].isBuy !== userTrades[i - 1].isBuy) {
          rapidTrades.push({ addr, gap });
          break;
        }
      }
    }
  }
  if (rapidTrades.length) {
    log(`\n  ⚠️  ${rapidTrades.length} wallets with rapid buy-sell (<2 slots):`);
    for (const t of rapidTrades.slice(0, 5)) {
      log(`    ${t.addr.slice(0, 16)} (${t.gap} slot gap)`);
    }
  }

  // 4. Timeline
  log("\n--- TRADE TIMELINE (first 20) ---");
  const sortedTimeline = timeline.sort((a, b) => a.slot - b.slot);
  for (const t of sortedTimeline.slice(0, 20)) {
    const time = t.time ? new Date(t.time * 1000).toISOString().slice(11, 19) : "?";
    const slotOff = t.slot - firstSlot;
    log(`  +${String(slotOff).padStart(5)} | ${time} | ${t.user.slice(0, 12)} | ${t.isBuy ? "BUY " : "SELL"} | ${t.sol.toFixed(4)} SOL`);
  }
}

if (mode === "wallet") {
  await analyzeWallet(address);
} else {
  await analyzeToken(address);
}

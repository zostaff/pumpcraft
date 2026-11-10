#!/usr/bin/env node
// Базовый бот: покупка / продажа токена на pump.fun bonding curve
// Использование:
//   node bots/basic-trader/trade.mjs buy  <mint> <sol_amount>
//   node bots/basic-trader/trade.mjs sell <mint> <percent|"all">
//   node bots/basic-trader/trade.mjs price <mint>
//   node bots/basic-trader/trade.mjs balance <mint>

import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SLIPPAGE_BPS } from "../../lib/config.mjs";
import { TOKEN_2022_PROGRAM } from "../../lib/constants.mjs";
import {
  buyIx,
  calcBuyTokens,
  calcSellSol,
  getBondingCurveState,
  getPrice,
  sellIx,
} from "../../lib/pumpfun.mjs";
import { connection, getSOLBalance, sendTxWithRetry } from "../../lib/rpc.mjs";
import { buildVersionedTx, computeBudgetIxs, jitoTipIx } from "../../lib/tx.mjs";
import { loadKeypair } from "../../lib/wallet.mjs";

const [cmd, mintStr, amountStr] = process.argv.slice(2);

if (!cmd || !["buy", "sell", "price", "balance", "wallet"].includes(cmd)) {
  console.log("Usage:");
  console.log("  node trade.mjs buy     <mint> <sol_amount>");
  console.log("  node trade.mjs sell    <mint> <percent|all>");
  console.log("  node trade.mjs price   <mint>");
  console.log("  node trade.mjs balance <mint>");
  console.log("  node trade.mjs wallet         — show wallet address and SOL balance");
  process.exit(1);
}

const wallet = loadKeypair();
const mint = mintStr ? new PublicKey(mintStr) : null;

async function showPrice() {
  const state = await getBondingCurveState(mint);
  if (!state) {
    console.log("Bonding curve not found (token may have migrated to AMM)");
    return;
  }
  if (state.complete) {
    console.log("Bonding curve complete — token migrated to PumpSwap AMM");
    return;
  }
  const price = getPrice(state);
  const mcap = price * Number(state.tokenTotalSupply) / 1e6;
  console.log(`Price: ${price.toFixed(12)} SOL/token`);
  console.log(`Virtual SOL: ${(Number(state.virtualSolReserves) / 1e9).toFixed(4)} SOL`);
  console.log(`Virtual Tokens: ${(Number(state.virtualTokenReserves) / 1e6).toFixed(0)}`);
  console.log(`Market cap: ~${mcap.toFixed(2)} SOL`);
}

async function showBalance() {
  const sol = await getSOLBalance(wallet.publicKey);
  console.log(`SOL: ${sol.toFixed(4)}`);
  try {
    const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM);
    const info = await connection.getTokenAccountBalance(ata);
    console.log(`Token: ${info.value.uiAmountString} (${mint.toBase58().slice(0, 8)}…)`);
  } catch {
    console.log(`Token: 0 (no ATA)`);
  }
}

async function showWallet() {
  const sol = await getSOLBalance(wallet.publicKey);
  console.log(`Address: ${wallet.publicKey.toBase58()}`);
  console.log(`SOL balance: ${sol.toFixed(4)}`);
}

async function buy(solAmount) {
  const sol = await getSOLBalance(wallet.publicKey);
  if (sol < solAmount + 0.01) {
    console.log(`Insufficient SOL: have ${sol.toFixed(4)}, need ${(solAmount + 0.01).toFixed(4)} (+ fees)`);
    return;
  }
  console.log(`Buying with ${solAmount} SOL (balance: ${sol.toFixed(4)})...`);
  const state = await getBondingCurveState(mint);
  if (!state || state.complete) {
    console.log("Bonding curve not available");
    return;
  }

  const expectedTokens = calcBuyTokens(state, solAmount);
  const minTokens = (expectedTokens * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

  console.log(`Expected: ~${(Number(expectedTokens) / 1e6).toFixed(0)} tokens`);
  console.log(`Min (slippage ${SLIPPAGE_BPS / 100}%): ~${(Number(minTokens) / 1e6).toFixed(0)}`);

  const ixs = [
    ...computeBudgetIxs(),
    buyIx(wallet.publicKey, mint, solAmount, minTokens),
    jitoTipIx(wallet.publicKey),
  ];

  const tx = await buildVersionedTx(wallet, ixs);
  await sendTxWithRetry(tx);
}

async function sell(pct) {
  const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM);
  const info = await connection.getTokenAccountBalance(ata);
  const totalTokens = BigInt(info.value.amount);

  if (totalTokens === 0n) {
    console.log("No tokens to sell");
    return;
  }

  const sellAmount = pct >= 100 ? totalTokens : (totalTokens * BigInt(pct)) / 100n;
  console.log(`Selling ${pct}%: ${(Number(sellAmount) / 1e6).toFixed(0)} tokens`);

  const state = await getBondingCurveState(mint);
  if (!state || state.complete) {
    console.log("Bonding curve not available");
    return;
  }

  const expectedSol = calcSellSol(state, sellAmount);
  const minSol = (expectedSol * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
  console.log(`Expected: ~${(Number(expectedSol) / 1e9).toFixed(4)} SOL`);
  console.log(`Min (slippage ${SLIPPAGE_BPS / 100}%): ~${(Number(minSol) / 1e9).toFixed(4)} SOL`);

  const ixs = [
    ...computeBudgetIxs(),
    sellIx(wallet.publicKey, mint, sellAmount, minSol),
    jitoTipIx(wallet.publicKey),
  ];

  const tx = await buildVersionedTx(wallet, ixs);
  await sendTxWithRetry(tx);
}

try {
  if (cmd === "wallet") await showWallet();
  else if (cmd === "price") await showPrice();
  else if (cmd === "balance") await showBalance();
  else if (cmd === "buy") await buy(Number(amountStr));
  else if (cmd === "sell") await sell(amountStr === "all" ? 100 : Number(amountStr));
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}

import { createRequire } from 'node:module';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SOL_MINT } from './constants.mjs';
import { sendTx, toKeypair, getTokenProgram } from './wallet-pool.mjs';

const require = createRequire(import.meta.url);
const { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount, getSellSolAmountFromTokenAmount } = require('@pump-fun/pump-sdk');
const BN = require('bn.js');

const PUMP_SDK = new PumpSdk();
let _sdkCache = null;
let _globalsCache = null;

async function getSdk(conn) {
  if (!_sdkCache) _sdkCache = new OnlinePumpSdk(conn);
  return _sdkCache;
}

async function getGlobals(conn) {
  if (_globalsCache) return _globalsCache;
  const sdk = await getSdk(conn);
  const global = await sdk.fetchGlobal();
  const feeConfig = await sdk.fetchFeeConfig().catch(() => null);
  _globalsCache = { global, feeConfig };
  return _globalsCache;
}

export async function buildBuy(conn, mint, buyerPk, solLamports, slippage) {
  const sdk = await getSdk(conn);
  const globals = await getGlobals(conn);
  const mintPk = new PublicKey(mint);
  const tokenProgram = await getTokenProgram(conn, mint);
  const amount = new BN(solLamports.toString());
  const s = await sdk.fetchBuyState(mintPk, buyerPk, tokenProgram);
  const tokens = getBuyTokenAmountFromSolAmount({
    global: globals.global, feeConfig: globals.feeConfig,
    mintSupply: s.bondingCurve.tokenTotalSupply,
    bondingCurve: s.bondingCurve, amount, quoteMint: SOL_MINT,
  });
  return PUMP_SDK.buyV2Instructions({
    global: globals.global,
    bondingCurveAccountInfo: s.bondingCurveAccountInfo,
    bondingCurve: s.bondingCurve,
    associatedUserAccountInfo: s.associatedUserAccountInfo,
    mint: mintPk, user: buyerPk,
    amount: tokens, quoteAmount: amount,
    slippage, tokenProgram,
  });
}

export async function buildSell(conn, mint, sellerPk, tokenAmount, slippage) {
  const sdk = await getSdk(conn);
  const globals = await getGlobals(conn);
  const mintPk = new PublicKey(mint);
  const tokenProgram = await getTokenProgram(conn, mint);
  const amount = new BN(tokenAmount.toString());
  const s = await sdk.fetchSellState(mintPk, sellerPk, tokenProgram);
  const out = getSellSolAmountFromTokenAmount({
    global: globals.global, feeConfig: globals.feeConfig,
    mintSupply: s.bondingCurve.tokenTotalSupply,
    bondingCurve: s.bondingCurve, amount,
  });
  return PUMP_SDK.sellV2Instructions({
    global: globals.global,
    bondingCurveAccountInfo: s.bondingCurveAccountInfo,
    bondingCurve: s.bondingCurve,
    mint: mintPk, user: sellerPk,
    amount, quoteAmount: out,
    slippage, tokenProgram,
  });
}

export async function executeBuy(conn, walletData, mint, solLamports, slippage = 10) {
  const kp = toKeypair(walletData);
  const ixs = await buildBuy(conn, mint, kp.publicKey, solLamports, slippage);
  return sendTx(conn, kp, ixs);
}

export async function executeSell(conn, walletData, mint, tokenAmount, slippage = 10) {
  const kp = toKeypair(walletData);
  const ixs = await buildSell(conn, mint, kp.publicKey, tokenAmount, slippage);
  return sendTx(conn, kp, ixs);
}

export async function sellAll(conn, wallets, mint, slippage = 15) {
  const mintPk = new PublicKey(mint);
  const tokenProgram = await getTokenProgram(conn, mint);
  const results = [];
  for (const w of wallets) {
    try {
      const kp = toKeypair(w);
      const ata = getAssociatedTokenAddressSync(mintPk, kp.publicKey, true, tokenProgram);
      const bal = await conn.getTokenAccountBalance(ata, 'confirmed').catch(() => null);
      const amount = BigInt(bal?.value?.amount ?? '0');
      if (amount === 0n) { results.push({ wallet: w.publicKey, status: 'skip' }); continue; }
      const sig = await executeSell(conn, w, mint, amount, slippage);
      results.push({ wallet: w.publicKey, status: 'sold', signature: sig });
    } catch (err) {
      results.push({ wallet: w.publicKey, status: 'failed', error: err.message });
    }
  }
  return results;
}

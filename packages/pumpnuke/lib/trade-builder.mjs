import { createRequire } from 'node:module';
import { PublicKey } from '@solana/web3.js';
import { SOL_MINT } from './constants.mjs';

const require = createRequire(import.meta.url);
const { OnlinePumpSdk, PUMP_SDK, getBuyTokenAmountFromSolAmount, getSellSolAmountFromTokenAmount, bondingCurvePda } = require('@pump-fun/pump-sdk');
const { OnlinePumpAmmSdk, PUMP_AMM_SDK, canonicalPumpPoolPda } = require('@pump-fun/pump-swap-sdk');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
const BN = require('bn.js');

let _globals = null;
let _globalsAt = 0;

export async function loadGlobals(conn) {
  if (_globals && Date.now() - _globalsAt < 600_000) return _globals;
  const sdk = new OnlinePumpSdk(conn);
  const [global, feeConfig] = await Promise.all([
    sdk.fetchGlobal(),
    sdk.fetchFeeConfig().catch(() => null),
  ]);
  _globals = { sdk, global, feeConfig };
  _globalsAt = Date.now();
  return _globals;
}

export function invalidateGlobals() {
  _globals = null;
  _globalsAt = 0;
}

async function detectVenue(conn, mint) {
  const curveInfo = await conn.getAccountInfo(bondingCurvePda(mint), 'confirmed');
  if (!curveInfo) throw new Error('not a pump.fun token');
  const curve = PUMP_SDK.decodeBondingCurve(curveInfo);
  return curve.complete ? 'pumpswap' : 'curve';
}

async function getTokenProgram(conn, mint) {
  const info = await conn.getAccountInfo(mint, 'confirmed');
  return info ? info.owner : new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
}

export async function detectTokenProgram(conn, mint) {
  return getTokenProgram(conn, mint);
}

export async function getTokenBalance(conn, mint, user, tokenProgram) {
  const ata = getAssociatedTokenAddressSync(mint, user, true, tokenProgram);
  const bal = await conn.getTokenAccountBalance(ata, 'confirmed').catch(() => null);
  return BigInt(bal?.value?.amount ?? '0');
}

export async function buildBuy(conn, globals, mint, user, solLamports, slippage, tokenProgram) {
  const venue = await detectVenue(conn, mint);
  const amount = new BN(solLamports.toString());

  if (venue === 'curve') {
    const s = await globals.sdk.fetchBuyState(mint, user, tokenProgram);
    const tokens = getBuyTokenAmountFromSolAmount({
      global: globals.global,
      feeConfig: globals.feeConfig,
      mintSupply: s.bondingCurve.tokenTotalSupply,
      bondingCurve: s.bondingCurve,
      amount,
      quoteMint: SOL_MINT,
    });
    return PUMP_SDK.buyV2Instructions({
      global: globals.global,
      bondingCurveAccountInfo: s.bondingCurveAccountInfo,
      bondingCurve: s.bondingCurve,
      associatedUserAccountInfo: s.associatedUserAccountInfo,
      mint,
      user,
      amount: tokens,
      quoteAmount: amount,
      slippage,
      tokenProgram,
    });
  }

  const poolPda = canonicalPumpPoolPda(mint);
  const state = await new OnlinePumpAmmSdk(conn).swapSolanaState(poolPda, user);
  return PUMP_AMM_SDK.buyQuoteInput(state, amount, slippage);
}

export async function buildSell(conn, globals, mint, user, tokenAmount, slippage, tokenProgram) {
  const venue = await detectVenue(conn, mint);
  const amount = new BN(tokenAmount.toString());

  if (venue === 'curve') {
    const s = await globals.sdk.fetchSellState(mint, user, tokenProgram);
    const out = getSellSolAmountFromTokenAmount({
      global: globals.global,
      feeConfig: globals.feeConfig,
      mintSupply: s.bondingCurve.tokenTotalSupply,
      bondingCurve: s.bondingCurve,
      amount,
    });
    return PUMP_SDK.sellV2Instructions({
      global: globals.global,
      bondingCurveAccountInfo: s.bondingCurveAccountInfo,
      bondingCurve: s.bondingCurve,
      mint,
      user,
      amount,
      quoteAmount: out,
      slippage,
      tokenProgram,
    });
  }

  const poolPda = canonicalPumpPoolPda(mint);
  const state = await new OnlinePumpAmmSdk(conn).swapSolanaState(poolPda, user);
  return PUMP_AMM_SDK.sellBaseInput(state, amount, slippage);
}

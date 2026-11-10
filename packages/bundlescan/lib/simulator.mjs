// simulator.mjs — analytical "what-if" sandwich simulation.
//
// This module is READ-ONLY ANALYSIS. It estimates, for an already-confirmed
// victim trade, how much a sandwich WOULD have extracted and how much the
// victim WOULD have lost, and what slippage setting would have rejected it.
// It builds no instructions and submits nothing to the network — its only
// purpose is quantifying harm so victims can protect themselves.
import { getTx } from './rpc.mjs';
import { decodeTransaction } from './tx-decoder.mjs';
import { parseTrades } from './trade-parser.mjs';
import { applyBuy, applySell, bondingBuyTokensOut } from './bonding-curve.mjs';
import { LAMPORTS_PER_SOL } from './constants.mjs';

const toSol = (l) => Number(l) / Number(LAMPORTS_PER_SOL);
const toLamports = (sol) => BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL)));

/**
 * Simulate a single front-run size against a victim buy.
 * @param {bigint} victimSolIn
 * @param {bigint} preVSol  virtual SOL reserves BEFORE the victim trade
 * @param {bigint} preVTok  virtual token reserves BEFORE the victim trade
 * @param {bigint} frontSol front-run notional (lamports)
 */
export function simulateOnce(victimSolIn, preVSol, preVTok, frontSol) {
  // 1. Attacker front-run buy.
  const f = applyBuy(frontSol, preVSol, preVTok);
  // 2. Victim buys against the shifted curve (worse price).
  const v = applyBuy(victimSolIn, f.vSol, f.vTok);
  // 3. Attacker sells the tokens it bought.
  const b = applySell(f.tokensOut, v.vSol, v.vTok);

  const attackerProfit = b.solOut - frontSol; // lamports (excludes tip/fees)
  const fairTokens = bondingBuyTokensOut(victimSolIn, preVSol, preVTok);
  const victimLostTokens = fairTokens - v.tokensOut;
  const victimLossLamports =
    v.tokensOut > 0n ? (victimSolIn * victimLostTokens) / v.tokensOut : 0n;

  // Slippage the victim suffered = price impact from the front-run.
  const slippageFraction =
    fairTokens > 0n ? Number(victimLostTokens) / Number(fairTokens) : 0;

  return {
    frontSol,
    attackerProfitLamports: attackerProfit,
    attackerProfitSol: toSol(attackerProfit),
    victimTokensActual: v.tokensOut,
    victimTokensFair: fairTokens,
    victimLossSol: toSol(victimLossLamports),
    slippageNeededToReject: slippageFraction, // victim tolerance below this rejects
  };
}

/**
 * Sweep front-run size 0.01..maxSol to find the profit-maximising attack,
 * then report what it would cost the victim. Purely analytical.
 */
export function optimize(victimSolIn, preVSol, preVTok, { maxSol = 10, stepSol = 0.01 } = {}) {
  let best = null;
  for (let s = stepSol; s <= maxSol + 1e-9; s += stepSol) {
    const r = simulateOnce(victimSolIn, preVSol, preVTok, toLamports(s));
    if (!best || r.attackerProfitLamports > best.attackerProfitLamports) best = r;
  }
  return best;
}

/**
 * Analyse a confirmed transaction by signature.
 * Returns the victim trade context and the optimal-sandwich estimate, or an
 * explanation if the tx has no parseable bonding-curve trade.
 */
export async function analyzeSignature(signature, { amount } = {}) {
  const raw = await getTx(signature);
  if (!raw) return { ok: false, reason: 'transaction not found' };

  const decoded = decodeTransaction(raw, raw.slot, raw.blockTime);
  const trades = parseTrades(decoded).filter((t) => t.direction === 'buy');
  if (trades.length === 0) {
    return { ok: false, reason: 'no parseable bonding-curve buy in this tx' };
  }

  // Treat the first buy as the victim trade. Reconstruct pre-trade reserves:
  // the event records post-trade virtual reserves.
  const t = trades[0];
  const victimSolIn = t.solAmount;
  const preVSol = t.virtualSolReserves - t.solAmount;
  const preVTok = t.virtualTokenReserves + t.tokenAmount;

  if (preVSol <= 0n || preVTok <= 0n) {
    return { ok: false, reason: 'could not reconstruct pre-trade reserves' };
  }

  const optimal = optimize(victimSolIn, preVSol, preVTok);
  const atRequested =
    amount != null ? simulateOnce(victimSolIn, preVSol, preVTok, toLamports(amount)) : null;

  return {
    ok: true,
    signature,
    slot: decoded.slot,
    mint: t.mint,
    victim: t.signer,
    victimSolIn: toSol(victimSolIn),
    reserves: { solBefore: preVSol, tokenBefore: preVTok },
    optimal,
    atRequested,
  };
}

export default { simulateOnce, optimize, analyzeSignature };

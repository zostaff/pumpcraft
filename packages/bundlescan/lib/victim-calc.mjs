// victim-calc.mjs — estimate the victim's loss from a sandwich.
//
// The victim buys at a worse price because the attacker's front-run moved the
// bonding curve. Loss = (tokens the victim WOULD have received without the
// front-run) - (tokens actually received), expressed in SOL at the victim's
// effective price. All math is BigInt on lamports / raw token units.
import { bondingBuyTokensOut } from './bonding-curve.mjs';
import { LAMPORTS_PER_SOL } from './constants.mjs';

/**
 * @param {object} p
 * @param {bigint} p.victimSolIn            lamports the victim spent
 * @param {bigint} p.victimTokensReceived   raw tokens the victim actually got
 * @param {bigint} p.reservesSolBefore      virtual SOL reserves BEFORE the front-run
 * @param {bigint} p.reservesTokenBefore    virtual token reserves BEFORE the front-run
 * @returns {{ lostTokens: bigint, lossSol: number, fairTokens: bigint }}
 */
export function victimLoss({
  victimSolIn,
  victimTokensReceived,
  reservesSolBefore,
  reservesTokenBefore,
}) {
  // Tokens the victim would have received against the pre-attack curve.
  const fairTokens = bondingBuyTokensOut(
    victimSolIn,
    reservesSolBefore,
    reservesTokenBefore
  );
  const lostTokens = fairTokens - victimTokensReceived;
  if (lostTokens <= 0n) {
    return { lostTokens: 0n, lossSol: 0, fairTokens };
  }
  // Value the lost tokens at the victim's effective price (sol per token).
  // lossSol = victimSolIn * (lostTokens / victimTokensReceived)
  const lossLamports =
    victimTokensReceived > 0n
      ? (victimSolIn * lostTokens) / victimTokensReceived
      : 0n;
  return {
    lostTokens,
    fairTokens,
    lossSol: Number(lossLamports) / Number(LAMPORTS_PER_SOL),
  };
}

export default { victimLoss };

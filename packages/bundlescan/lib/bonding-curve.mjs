// bonding-curve.mjs — constant-product (x*y=k) bonding-curve math, BigInt only.
// Used by the analytical simulator and victim-loss estimation. Read-only math;
// it does not build or submit any transaction.

/** Tokens out when buying with `solIn` lamports against the given reserves. */
export function bondingBuyTokensOut(solIn, virtualSolReserves, virtualTokenReserves) {
  if (solIn <= 0n) return 0n;
  return (solIn * virtualTokenReserves) / (virtualSolReserves + solIn);
}

/** SOL out (lamports) when selling `tokenIn` tokens against the given reserves. */
export function bondingSellSolOut(tokenIn, virtualSolReserves, virtualTokenReserves) {
  if (tokenIn <= 0n) return 0n;
  return (tokenIn * virtualSolReserves) / (virtualTokenReserves + tokenIn);
}

/** Apply a buy to reserves and return the new reserves + tokens out. */
export function applyBuy(solIn, vSol, vTok) {
  const out = bondingBuyTokensOut(solIn, vSol, vTok);
  return { vSol: vSol + solIn, vTok: vTok - out, tokensOut: out };
}

/** Apply a sell to reserves and return the new reserves + sol out. */
export function applySell(tokenIn, vSol, vTok) {
  const out = bondingSellSolOut(tokenIn, vSol, vTok);
  return { vSol: vSol - out, vTok: vTok + tokenIn, solOut: out };
}

export default { bondingBuyTokensOut, bondingSellSolOut, applyBuy, applySell };

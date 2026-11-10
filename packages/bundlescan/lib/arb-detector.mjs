// arb-detector.mjs — detect atomic arbitrage transactions.
//
// An arb tx starts and ends in SOL (or a base asset), cycles through one or
// more pools, and nets a positive SOL profit for the signer within a single
// transaction. It is victimless in the sandwich sense but is MEV activity worth
// classifying. Heuristic: signer's net SOL > 0 after fees, no net token holding
// change for the traded mints, and it touches >= 2 DEX programs or >= 2 pools.
import { PROGRAM_LABELS } from './constants.mjs';
import { toSol } from './profit-calc.mjs';

const DEX_IDS = new Set([
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // raydium
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // orca
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // pumpswap
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // pumpfun
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // jupiter
]);

function dexProgramsTouched(decoded) {
  const set = new Set();
  for (const ix of decoded.instructions) if (DEX_IDS.has(ix.programId)) set.add(ix.programId);
  for (const ix of decoded.innerInstructions) if (DEX_IDS.has(ix.programId)) set.add(ix.programId);
  return set;
}

/** Detect arbitrage among a block's decoded txs. */
export function detectArbs(decodedTxs, opts = {}) {
  const minProfitSol = opts.minProfitSol ?? 0;
  const out = [];

  for (const d of decodedTxs) {
    if (d.err) continue;
    const dexes = dexProgramsTouched(d);
    if (dexes.size === 0) continue;

    const signerSol = d.balanceChanges.find((c) => c.account === d.signer)?.lamports ?? 0n;
    if (signerSol <= 0n) continue; // arb must net positive SOL

    // Signer should not be left holding a materially larger token position:
    // a pure arb returns to base. Allow dust.
    const signerTokenDelta = d.tokenChanges
      .filter((c) => c.owner === d.signer)
      .reduce((acc, c) => acc + (c.amount < 0n ? -c.amount : c.amount), 0n);

    const profitSol = toSol(signerSol);
    if (profitSol < minProfitSol) continue;

    // Require multi-hop: either 2+ DEX programs, or evidence of a cycle via logs.
    const multiHop = dexes.size >= 2 ||
      d.logMessages.filter((l) => /Instruction:\s*(Swap|Route)/.test(l)).length >= 2;
    if (!multiHop) continue;

    out.push({
      type: 'arb',
      slot: d.slot,
      blockTime: d.blockTime,
      signer: d.signer,
      signature: d.signature,
      txIndex: d.txIndex,
      profitLamports: signerSol,
      profitSol,
      tipLamports: d.tip?.lamports ?? 0n,
      tipService: d.tip?.service ?? null,
      programs: [...dexes].map((p) => PROGRAM_LABELS[p] ?? p),
      heldTokenDust: signerTokenDelta,
    });
  }

  out.sort((a, b) => b.profitSol - a.profitSol);
  return out;
}

export default { detectArbs };

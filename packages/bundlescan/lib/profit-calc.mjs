// profit-calc.mjs — compute extracted profit of an attacker (lamports, BigInt).
import { LAMPORTS_PER_SOL } from './constants.mjs';

export function toSol(lamports) {
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}

/**
 * Net SOL change for a given account across a set of decoded txs.
 * This already reflects fees paid and tips transferred out, because those
 * appear in the account's lamport balance deltas.
 */
export function netLamports(decodedTxs, account) {
  let total = 0n;
  for (const d of decodedTxs) {
    const change = d.balanceChanges.find((c) => c.account === account);
    if (change) total += change.lamports;
  }
  return total;
}

/**
 * Attacker profit from a sandwich, per the guide's formula:
 *   profit = sol_received(back) - sol_spent(front) - tip - fees
 * All inputs are BigInt lamports.
 */
export function attackerProfit({ solSpentFront, solReceivedBack, tipLamports = 0n, fees = 0n }) {
  return solReceivedBack - solSpentFront - tipLamports - fees;
}

/**
 * Convenience: given the attacker's front/back decoded txs, compute profit
 * directly from balance deltas (most robust — captures all costs).
 */
export function attackerProfitFromBalances(decodedTxs, attacker) {
  const lamports = netLamports(decodedTxs, attacker);
  return { lamports, sol: toSol(lamports) };
}

export default { toSol, netLamports, attackerProfit, attackerProfitFromBalances };

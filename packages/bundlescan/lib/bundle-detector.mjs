// bundle-detector.mjs — group transactions in a single block into bundles.
//
// Heuristics (from the guide):
//  - A transaction that transfers lamports to a known tip account is a tip tx.
//  - Transactions in the same slot sharing a signer with a tipping tx, or the
//    tip tx itself, form a bundle.
//  - One signer appearing on several txs in one slot is also treated as a bundle.
import { tipServiceFor } from './constants.mjs';
import { decodeTransaction } from './tx-decoder.mjs';

// Detect a tip transfer inside a decoded tx. Returns { service, lamports } or null.
export function detectTip(decoded) {
  let best = null;
  for (const change of decoded.balanceChanges) {
    if (change.lamports <= 0n) continue; // tip account receives
    const service = tipServiceFor(change.account);
    if (service) {
      if (!best || change.lamports > best.lamports) {
        best = { service, account: change.account, lamports: change.lamports };
      }
    }
  }
  return best;
}

/**
 * Decode a whole block and return its transactions plus detected bundles.
 * @param {object} block  result of getBlock(slot, {maxSupportedTransactionVersion:0})
 * @param {number} slot
 * @returns {{ slot, decoded: Array, bundles: Array }}
 */
export function analyzeBlock(block, slot) {
  const entries = block?.transactions ?? [];
  const blockTime = block?.blockTime ?? null;

  const decoded = entries.map((entry, index) => {
    const d = decodeTransaction(entry, slot, blockTime);
    d.txIndex = index;
    d.tip = detectTip(d);
    return d;
  });

  // Group by signer within the slot.
  const bySigner = new Map();
  for (const d of decoded) {
    if (!d.signer) continue;
    if (!bySigner.has(d.signer)) bySigner.set(d.signer, []);
    bySigner.get(d.signer).push(d);
  }

  const bundles = [];
  for (const [signer, txs] of bySigner) {
    const hasTip = txs.some((t) => t.tip);
    const multi = txs.length > 1;
    if (!hasTip && !multi) continue;
    txs.sort((a, b) => a.txIndex - b.txIndex);
    const tipTotal = txs.reduce(
      (acc, t) => acc + (t.tip ? t.tip.lamports : 0n),
      0n
    );
    bundles.push({
      slot,
      signer,
      txIndexes: txs.map((t) => t.txIndex),
      signatures: txs.map((t) => t.signature),
      txs,
      tipLamports: tipTotal,
      tipService: txs.find((t) => t.tip)?.tip?.service ?? null,
      size: txs.length,
    });
  }

  // Deterministic order: by first tx index.
  bundles.sort((a, b) => a.txIndexes[0] - b.txIndexes[0]);
  return { slot, blockTime, decoded, bundles };
}

export default { analyzeBlock, detectTip };

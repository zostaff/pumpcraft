// sandwich-detector.mjs — detect sandwich patterns inside a single block.
//
// Pattern (per the guide): for one mint, three trades in block order
//   TX_1 attacker BUYS  (front-run)
//   TX_2 victim    BUYS  (worse price)
//   TX_3 attacker SELLS (back-run)
// with:
//   - trade[0].signer === trade[2].signer  (same attacker)
//   - trade[1].signer !== trade[0].signer  (different victim)
//   - directions buy / buy / sell
//   - tx order  front < victim < back
//   - a tip transfer in one of the attacker's txs
import { parseTrades } from './trade-parser.mjs';
import { attackerProfitFromBalances, toSol } from './profit-calc.mjs';
import { victimLoss } from './victim-calc.mjs';

// Build a flat, block-ordered list of (trade + its decoded tx) entries.
function collectTrades(decodedTxs) {
  const rows = [];
  for (const d of decodedTxs) {
    if (d.err) continue; // ignore failed txs
    for (const trade of parseTrades(d)) {
      rows.push({ trade, tx: d, txIndex: d.txIndex });
    }
  }
  rows.sort((a, b) => a.txIndex - b.txIndex);
  return rows;
}

/**
 * @param {Array} decodedTxs  decoded transactions for one block (with .txIndex, .tip)
 * @param {object} [opts]
 * @param {number} [opts.minProfitSol]  discard detections below this profit
 * @returns {Array} sandwich detections
 */
export function detectSandwiches(decodedTxs, opts = {}) {
  const minProfitSol = opts.minProfitSol ?? 0;
  const rows = collectTrades(decodedTxs);

  // Group trade rows by mint, preserving block order.
  const byMint = new Map();
  for (const row of rows) {
    const mint = row.trade.mint;
    if (!mint) continue;
    if (!byMint.has(mint)) byMint.set(mint, []);
    byMint.get(mint).push(row);
  }

  const detections = [];

  for (const [mint, group] of byMint) {
    if (group.length < 3) continue;

    // Scan for front(buy) / victim(buy) / back(sell) with matching attacker.
    for (let i = 0; i < group.length; i++) {
      const front = group[i];
      if (front.trade.direction !== 'buy') continue;
      const attacker = front.trade.signer;

      // Find a later sell by the same attacker (back-run).
      for (let k = group.length - 1; k > i + 1; k--) {
        const back = group[k];
        if (back.trade.direction !== 'sell') continue;
        if (back.trade.signer !== attacker) continue;

        // Need at least one victim buy strictly between them, by someone else.
        const victims = [];
        for (let j = i + 1; j < k; j++) {
          const mid = group[j];
          if (
            mid.trade.direction === 'buy' &&
            mid.trade.signer !== attacker &&
            mid.txIndex > front.txIndex &&
            mid.txIndex < back.txIndex
          ) {
            victims.push(mid);
          }
        }
        if (victims.length === 0) continue;

        // Require a tip in one of the attacker's txs (front or back).
        const tip =
          front.tx.tip?.lamports ?? back.tx.tip?.lamports ?? 0n;
        const hasTip = Boolean(front.tx.tip || back.tx.tip);

        // Profit from the attacker's net balance change across front+back.
        const profit = attackerProfitFromBalances([front.tx, back.tx], attacker);
        if (profit.sol < minProfitSol) continue;

        // Victim loss estimate against pre-attack reserves (from front trade).
        const primaryVictim = victims[0];
        const loss = victimLoss({
          victimSolIn: primaryVictim.trade.solAmount,
          victimTokensReceived: primaryVictim.trade.tokenAmount,
          reservesSolBefore: front.trade.virtualSolReserves,
          reservesTokenBefore: front.trade.virtualTokenReserves,
        });

        detections.push({
          type: 'sandwich',
          slot: front.tx.slot,
          blockTime: front.tx.blockTime,
          mint,
          attacker,
          victim: primaryVictim.trade.signer,
          victimCount: victims.length,
          frontSig: front.tx.signature,
          victimSig: primaryVictim.tx.signature,
          backSig: back.tx.signature,
          txIndexes: [front.txIndex, primaryVictim.txIndex, back.txIndex],
          tipLamports: tip,
          tipSol: toSol(tip),
          hasTip,
          tipService: front.tx.tip?.service ?? back.tx.tip?.service ?? null,
          profitLamports: profit.lamports,
          profitSol: profit.sol,
          lossSol: loss.lossSol,
          lostTokens: loss.lostTokens,
        });

        // One detection per (front, back) pair is enough; move on.
        break;
      }
    }
  }

  // Strongest first.
  detections.sort((a, b) => b.profitSol - a.profitSol);
  return detections;
}

export default { detectSandwiches };

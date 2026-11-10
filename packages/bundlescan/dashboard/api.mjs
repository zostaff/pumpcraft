// api.mjs — JSON API backing the dashboard. Pure functions returning plain
// objects; server.mjs handles HTTP and serialization.
import { recent, readSince, readAll } from '../lib/store.mjs';
import { analyzeSignature } from '../lib/simulator.mjs';
import { getTx } from '../lib/rpc.mjs';
import { decodeTransaction } from '../lib/tx-decoder.mjs';
import { parseTrades } from '../lib/trade-parser.mjs';

const toSol = (l) => Number(l) / 1e9;

/** GET /api/recent — the latest sandwich detections. */
export function apiRecent(limit = 50) {
  return { detections: recent(limit, 'sandwich') };
}

/** GET /api/stats — aggregate stats over a window (default 24h). */
export function apiStats(hours = 24) {
  const rows = readSince(hours);
  const sandwiches = rows.filter((r) => r.type === 'sandwich');
  const arbs = rows.filter((r) => r.type === 'arb');
  const sum = (a, f) => a.reduce((x, r) => x + (f(r) || 0), 0);

  const attackers = new Map();
  const tokens = new Map();
  for (const r of sandwiches) {
    const a = attackers.get(r.attacker) ?? { count: 0, profit: 0 };
    a.count++; a.profit += r.profitSol || 0; attackers.set(r.attacker, a);
    const t = tokens.get(r.mint) ?? { count: 0, profit: 0 };
    t.count++; t.profit += r.profitSol || 0; tokens.set(r.mint, t);
  }
  const rank = (m) =>
    [...m.entries()].map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.profit - a.profit).slice(0, 20);

  return {
    hours,
    sandwichCount: sandwiches.length,
    arbCount: arbs.length,
    totalProfit: sum(sandwiches, (r) => r.profitSol) + sum(arbs, (r) => r.profitSol),
    totalLoss: sum(sandwiches, (r) => r.lossSol),
    avgProfit: sandwiches.length ? sum(sandwiches, (r) => r.profitSol) / sandwiches.length : 0,
    topAttackers: rank(attackers),
    topTokens: rank(tokens),
  };
}

/** GET /api/wallet/:addr — recorded attacks where this wallet was the victim. */
export function apiWallet(addr) {
  const hits = readAll((r) => r.type === 'sandwich' && r.victim === addr);
  const totalLoss = hits.reduce((a, r) => a + (r.lossSol || 0), 0);
  return { wallet: addr, attacks: hits.slice(-100).reverse(), count: hits.length, totalLoss };
}

/** GET /api/tx/:sig — decode and classify a single transaction. */
export async function apiTx(sig) {
  const raw = await getTx(sig);
  if (!raw) return { ok: false, reason: 'not found' };
  const decoded = decodeTransaction(raw, raw.slot, raw.blockTime);
  const trades = parseTrades(decoded);
  return {
    ok: true,
    signature: sig,
    slot: decoded.slot,
    blockTime: decoded.blockTime,
    signer: decoded.signer,
    fee: toSol(decoded.fee),
    failed: Boolean(decoded.err),
    tip: decoded.tip ? { service: decoded.tip.service, sol: toSol(decoded.tip.lamports) } : null,
    trades: trades.map((t) => ({
      program: t.program,
      mint: t.mint,
      direction: t.direction,
      sol: toSol(t.solAmount),
      tokens: t.tokenAmount?.toString(),
    })),
    balanceChanges: decoded.balanceChanges.map((c) => ({ account: c.account, sol: c.sol })),
  };
}

/** GET /api/simulate/:sig?amount=0.5 — analytical what-if. */
export async function apiSimulate(sig, amount) {
  return analyzeSignature(sig, { amount });
}

export default { apiRecent, apiStats, apiWallet, apiTx, apiSimulate };

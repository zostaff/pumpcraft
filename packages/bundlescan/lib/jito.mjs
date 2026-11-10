// jito.mjs — READ-ONLY Jito Block Engine client.
//
// Scope note: this client intentionally supports only *read* endpoints —
// listing tip accounts, reading the current tip floor, and looking up the
// status of bundles by id. It deliberately does NOT send or submit bundles.
// bundlescan is a detection/analytics tool; execution is out of scope.
import { log } from './logger.mjs';

const BLOCK_ENGINE = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const TIP_FLOOR = 'https://bundles.jito.wtf/api/v1/bundles/tip_floor';

async function rpc(method, params = []) {
  const res = await fetch(BLOCK_ENGINE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`jito ${method} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`jito ${method}: ${json.error.message}`);
  return json.result;
}

/** Public tip accounts currently advertised by the block engine. */
export async function getTipAccounts() {
  try {
    return await rpc('getTipAccounts', []);
  } catch (err) {
    log.warn('jito.getTipAccounts', String(err?.message || err));
    return [];
  }
}

/** Current tip-floor percentiles (lamports). Useful context for analytics. */
export async function getTipFloor() {
  try {
    const res = await fetch(TIP_FLOOR);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    log.warn('jito.getTipFloor', String(err?.message || err));
    return null;
  }
}

/** Look up finalized status of up to 5 bundle ids. */
export async function getBundleStatuses(bundleIds = []) {
  if (bundleIds.length === 0) return [];
  try {
    const result = await rpc('getBundleStatuses', [bundleIds]);
    return result?.value ?? [];
  } catch (err) {
    log.warn('jito.getBundleStatuses', String(err?.message || err));
    return [];
  }
}

export default { getTipAccounts, getTipFloor, getBundleStatuses };

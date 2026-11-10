import bs58 from 'bs58';
import { config } from './config.js';
import { log } from './logger.js';

async function postBundle(encoded) {
  const url = `${config.jitoBlockEngine}/api/v1/bundles`;
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'sendBundle',
    params: [encoded],
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function sendBundle(signedTransactions) {
  const encoded = signedTransactions.map(tx =>
    bs58.encode(tx.serialize()),
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = await postBundle(encoded);

      if (json.error) {
        const code = json.error.code ?? '?';
        const msg  = json.error.message ?? JSON.stringify(json.error);
        log.error(`Jito error [${code}]: ${msg}${attempt === 0 ? ' — retrying' : ''}`);
        if (attempt === 0) continue;
        return null;
      }

      const bundleId = json.result;
      log.bundle(bundleId);
      return bundleId;
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? 'request timeout (5s)' : err.message;
      log.error(`Jito send failed: ${reason}${attempt === 0 ? ' — retrying' : ''}`);
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

export async function getBundleStatus(bundleId) {
  const url = `${config.jitoBlockEngine}/api/v1/bundles`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBundleStatuses',
        params: [[bundleId]],
      }),
      signal: AbortSignal.timeout(5000),
    });

    const json = await res.json();
    return json.result?.value?.[0] ?? null;
  } catch (err) {
    log.error(`Bundle status check failed: ${err.message}`);
    return null;
  }
}

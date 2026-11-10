import { SystemProgram, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { JITO_ENDPOINT, JITO_TIP_ACCOUNTS } from './constants.mjs';
import { log } from './logger.mjs';

export function pickTipAccount() {
  return JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
}

export function buildTipInstruction(payer, lamports) {
  const tip = pickTipAccount();
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: new PublicKey(tip),
    lamports: BigInt(lamports),
  });
}

export async function sendBundle(serializedTxs) {
  const b58Txs = serializedTxs.map(t => bs58.encode(Buffer.from(t)));
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'sendBundle',
    params: [b58Txs],
  });

  const res = await fetch(JITO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const json = await res.json();
  if (json.result) return json.result;
  throw new Error(`jito sendBundle failed: ${json.error?.message || JSON.stringify(json.error)}`);
}

export async function checkBundleStatus(bundleId) {
  try {
    const res = await fetch(JITO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getInflightBundleStatuses',
        params: [[bundleId]],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const json = await res.json();
    const st = json.result?.value?.[0]?.status ?? null;
    if (st === 'Landed') return 'confirmed';
    if (st === 'Invalid' || st === 'Failed') return 'failed';
    return st?.toLowerCase() || 'pending';
  } catch {
    return 'unknown';
  }
}

export async function waitForBundle(bundleId, { pollCount = 10, pollIntervalMs = 3000 } = {}) {
  for (let i = 0; i < pollCount; i++) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    const status = await checkBundleStatus(bundleId);
    log.info(`jito bundle poll ${i + 1}/${pollCount}: ${status}`);
    if (status === 'confirmed') return true;
    if (status === 'failed') return false;
  }
  return false;
}

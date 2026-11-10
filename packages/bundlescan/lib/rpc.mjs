// rpc.mjs — Solana RPC connection + rate-limited block fetching with caching.
import { Connection } from '@solana/web3.js';
import { config } from './config.mjs';
import { log } from './logger.mjs';

export const connection = new Connection(config.rpcUrl, {
  commitment: 'confirmed',
  wsEndpoint: config.rpcWss,
});

// --- simple token-bucket rate limiter for getBlock ---
class RateLimiter {
  constructor(perSec) {
    this.interval = 1000 / perSec;
    this.last = 0;
  }
  async wait() {
    const now = Date.now();
    const earliest = this.last + this.interval;
    if (now < earliest) {
      await new Promise((r) => setTimeout(r, earliest - now));
    }
    this.last = Date.now();
  }
}

const blockLimiter = new RateLimiter(config.maxBlocksPerSec);

// The guide specifies maxSupportedTransactionVersion: 0, but mainnet now emits
// higher transaction versions. Start at 0 and auto-escalate when the RPC tells
// us a newer version exists, so decoding keeps working as the network evolves.
let maxTxVersion = 0;
function escalateFromError(message) {
  const m = /Transaction version \((\d+)\) is not supported/.exec(message) ||
    /maxSupportedTransactionVersion[^\d]*(\d+)/.exec(message);
  if (m) {
    const v = Number(m[1]);
    if (v > maxTxVersion) {
      maxTxVersion = v;
      return true;
    }
  }
  return false;
}

// --- LRU-ish block cache: fetch a given slot's block exactly once ---
const blockCache = new Map();
const BLOCK_CACHE_MAX = 500;

function cachePut(slot, value) {
  blockCache.set(slot, value);
  if (blockCache.size > BLOCK_CACHE_MAX) {
    const oldest = blockCache.keys().next().value;
    blockCache.delete(oldest);
  }
}

/**
 * Fetch a full block (versioned tx supported), rate-limited and cached.
 * Returns the block object or null if it is not available (skipped slot, etc.).
 */
export async function getBlockCached(slot, opts = {}, _retried = false) {
  if (blockCache.has(slot)) return blockCache.get(slot);
  await blockLimiter.wait();
  try {
    const block = await connection.getBlock(slot, {
      maxSupportedTransactionVersion: maxTxVersion,
      transactionDetails: 'full',
      rewards: false,
      commitment: 'confirmed',
      ...opts,
    });
    cachePut(slot, block);
    return block;
  } catch (err) {
    const msg = String(err?.message || err);
    // Newer tx version than we asked for: bump and retry once (don't cache).
    if (!_retried && escalateFromError(msg)) {
      return getBlockCached(slot, opts, true);
    }
    // Missing/skipped slots throw; treat as "no block".
    if (/was skipped|not available|Slot \d+/.test(msg)) {
      cachePut(slot, null);
      return null;
    }
    log.warn('getBlock', slot, msg);
    return null;
  }
}

/** Fetch a single parsed/raw transaction by signature (versioned supported). */
export async function getTx(signature, _retried = false) {
  try {
    return await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: maxTxVersion,
      commitment: 'confirmed',
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (!_retried && escalateFromError(msg)) return getTx(signature, true);
    log.warn('getTransaction', signature, msg);
    return null;
  }
}

export default { connection, getBlockCached, getTx };

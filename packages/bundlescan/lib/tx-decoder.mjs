// tx-decoder.mjs — universal decoder for Solana transactions.
// Works on both getTransaction() results and getBlock() transaction entries.
// Returns a normalised shape used by every detector downstream.
import bs58 from 'bs58';
import { PROGRAMS, LAMPORTS_PER_SOL } from './constants.mjs';

// Resolve the full account key list for a (possibly versioned) message,
// including addresses loaded from Address Lookup Tables (found in meta).
export function resolveAccountKeys(txMessage, meta) {
  // web3.js message: .staticAccountKeys / .getAccountKeys, or legacy .accountKeys.
  let staticKeys = [];
  if (txMessage.staticAccountKeys) {
    staticKeys = txMessage.staticAccountKeys.map((k) => k.toBase58());
  } else if (txMessage.accountKeys) {
    staticKeys = txMessage.accountKeys.map((k) =>
      typeof k === 'string' ? k : k.toBase58 ? k.toBase58() : String(k)
    );
  }
  const writable = (meta?.loadedAddresses?.writable ?? []).map((k) =>
    typeof k === 'string' ? k : k.toBase58()
  );
  const readonly = (meta?.loadedAddresses?.readonly ?? []).map((k) =>
    typeof k === 'string' ? k : k.toBase58()
  );
  return [...staticKeys, ...writable, ...readonly];
}

function instrData(ix) {
  // Compiled instruction data may be base58 string, Uint8Array, or number[].
  const d = ix.data;
  if (!d) return Buffer.alloc(0);
  if (typeof d === 'string') {
    try {
      return Buffer.from(bs58.decode(d));
    } catch {
      return Buffer.from(d, 'base64');
    }
  }
  return Buffer.from(d);
}

function compiledInstructions(txMessage) {
  return txMessage.compiledInstructions ?? txMessage.instructions ?? [];
}

function ixAccountIndexes(ix) {
  return ix.accountKeyIndexes ?? ix.accounts ?? [];
}

/**
 * Decode one transaction (as found in a block entry or getTransaction result).
 * @param {{transaction:any, meta:any, slot?:number, blockTime?:number}} entry
 * @param {number} [slot]
 * @param {number} [blockTime]
 */
export function decodeTransaction(entry, slot, blockTime) {
  const tx = entry.transaction ?? entry;
  const meta = entry.meta ?? null;
  const message = tx.message;
  const keys = resolveAccountKeys(message, meta);

  const signature = Array.isArray(tx.signatures) ? tx.signatures[0] : tx.signature;
  const signer = keys[0] ?? null;
  const fee = meta ? BigInt(meta.fee ?? 0) : 0n;

  // Top-level instructions.
  const instructions = compiledInstructions(message).map((ix) => {
    const programIdx = ix.programIdIndex;
    return {
      programId: keys[programIdx] ?? null,
      accounts: ixAccountIndexes(ix).map((i) => keys[i]).filter(Boolean),
      data: instrData(ix),
    };
  });

  // Inner (CPI) instructions from meta.
  const innerInstructions = [];
  for (const inner of meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions ?? []) {
      innerInstructions.push({
        parentIndex: inner.index,
        programId: keys[ix.programIdIndex] ?? null,
        accounts: ixAccountIndexes(ix).map((i) => keys[i]).filter(Boolean),
        data: instrData(ix),
      });
    }
  }

  // SOL balance changes (lamports) keyed by account.
  const balanceChanges = [];
  if (meta?.preBalances && meta?.postBalances) {
    for (let i = 0; i < meta.preBalances.length; i++) {
      const delta = BigInt(meta.postBalances[i]) - BigInt(meta.preBalances[i]);
      if (delta !== 0n) {
        balanceChanges.push({
          account: keys[i] ?? null,
          lamports: delta,
          sol: Number(delta) / Number(LAMPORTS_PER_SOL),
        });
      }
    }
  }

  // SPL token balance changes.
  const tokenChanges = [];
  const pre = meta?.preTokenBalances ?? [];
  const post = meta?.postTokenBalances ?? [];
  const preByIdx = new Map(pre.map((b) => [b.accountIndex, b]));
  const seen = new Set();
  for (const b of post) {
    seen.add(b.accountIndex);
    const p = preByIdx.get(b.accountIndex);
    const preAmt = BigInt(p?.uiTokenAmount?.amount ?? '0');
    const postAmt = BigInt(b.uiTokenAmount?.amount ?? '0');
    const delta = postAmt - preAmt;
    if (delta !== 0n) {
      tokenChanges.push({
        account: keys[b.accountIndex] ?? null,
        owner: b.owner ?? null,
        mint: b.mint,
        decimals: b.uiTokenAmount?.decimals ?? 0,
        amount: delta,
      });
    }
  }
  for (const p of pre) {
    if (seen.has(p.accountIndex)) continue;
    const delta = -BigInt(p.uiTokenAmount?.amount ?? '0');
    if (delta !== 0n) {
      tokenChanges.push({
        account: keys[p.accountIndex] ?? null,
        owner: p.owner ?? null,
        mint: p.mint,
        decimals: p.uiTokenAmount?.decimals ?? 0,
        amount: delta,
      });
    }
  }

  return {
    signature,
    slot: slot ?? entry.slot ?? null,
    blockTime: blockTime ?? entry.blockTime ?? null,
    signer,
    fee,
    accountKeys: keys,
    instructions,
    innerInstructions,
    balanceChanges,
    tokenChanges,
    logMessages: meta?.logMessages ?? [],
    err: meta?.err ?? null,
  };
}

/** True if the decoded tx touches any of the given program ids. */
export function touchesProgram(decoded, programIds) {
  const set = programIds instanceof Set ? programIds : new Set(programIds);
  for (const ix of decoded.instructions) if (set.has(ix.programId)) return true;
  for (const ix of decoded.innerInstructions) if (set.has(ix.programId)) return true;
  return false;
}

export const KNOWN_PROGRAMS = PROGRAMS;
export default { decodeTransaction, resolveAccountKeys, touchesProgram };

import { Keypair, SystemProgram, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { createRequire } from 'node:module';
import bs58 from 'bs58';
import { FEE_RESERVE_LAMPORTS, COMPUTE_UNIT_LIMIT } from './constants.mjs';
import { PRIORITY_FEE, DRY_RUN, SOL_RESERVE } from './config.mjs';
import { ComputeBudgetProgram } from '@solana/web3.js';
import { log, shortKey, solStr } from './logger.mjs';

const require = createRequire(import.meta.url);
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toKeypair(w) {
  return Keypair.fromSecretKey(bs58.decode(w.secretKey));
}

function priorityIxs() {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }),
  ];
}

export function generateWallets(count) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const kp = Keypair.generate();
    wallets.push({
      publicKey: kp.publicKey.toBase58(),
      secretKey: bs58.encode(kp.secretKey),
    });
  }
  return wallets;
}

export async function fundWallets(conn, masterKeypair, wallets, solPerWallet) {
  const lamports = BigInt(Math.round(solPerWallet * 1e9));
  const results = [];

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];

    if (DRY_RUN) {
      log.paper(`fund ${shortKey(w.publicKey)} ${solStr(lamports)} SOL (simulated)`);
      results.push({ wallet: w.publicKey, status: 'confirmed', sol: solPerWallet, simulated: true });
      await sleep(100);
      continue;
    }

    try {
      const ix = SystemProgram.transfer({
        fromPubkey: masterKeypair.publicKey,
        toPubkey: new PublicKey(w.publicKey),
        lamports,
      });

      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      const msg = new TransactionMessage({
        payerKey: masterKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const tx = new VersionedTransaction(msg);
      tx.sign([masterKeypair]);
      const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });

      log.fund(`${shortKey(w.publicKey)} ${solStr(lamports)} SOL  sig=${sig.slice(0, 12)}..`);
      results.push({ wallet: w.publicKey, status: 'sent', signature: sig, sol: solPerWallet });

      await conn.confirmTransaction(sig, 'confirmed').catch(() => {});
    } catch (err) {
      log.error(`fund ${shortKey(w.publicKey)} failed: ${err.message}`);
      results.push({ wallet: w.publicKey, status: 'failed', error: err.message, sol: solPerWallet });
    }

    if (i < wallets.length - 1) await sleep(500);
  }

  return results;
}

export async function drainWallets(conn, wallets, masterKeypair) {
  const results = [];
  const feeEstimate = 5000;

  for (const w of wallets) {
    if (DRY_RUN) {
      log.paper(`drain ${shortKey(w.publicKey)} (simulated)`);
      results.push({ wallet: w.publicKey, status: 'confirmed', sol: 0, simulated: true });
      await sleep(50);
      continue;
    }

    try {
      const kp = toKeypair(w);
      const balance = await conn.getBalance(kp.publicKey, 'confirmed');
      const sendAmount = balance - feeEstimate;

      if (sendAmount < 5000) {
        results.push({ wallet: w.publicKey, status: 'skipped', sol: balance / 1e9 });
        continue;
      }

      const ix = SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: masterKeypair.publicKey,
        lamports: BigInt(sendAmount),
      });

      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      const msg = new TransactionMessage({
        payerKey: kp.publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const tx = new VersionedTransaction(msg);
      tx.sign([kp]);
      const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });

      log.drain(`${shortKey(w.publicKey)} ${solStr(sendAmount)} SOL  sig=${sig.slice(0, 12)}..`);
      results.push({ wallet: w.publicKey, status: 'sent', signature: sig, sol: sendAmount / 1e9 });
    } catch (err) {
      log.error(`drain ${shortKey(w.publicKey)} failed: ${err.message}`);
      results.push({ wallet: w.publicKey, status: 'failed', error: err.message });
    }
  }

  return results;
}

export async function sellAll(conn, wallets, mintStr) {
  const mintPk = new PublicKey(mintStr);
  const results = [];

  if (DRY_RUN) {
    for (const w of wallets) {
      log.paper(`sell all tokens ${shortKey(w.publicKey)} (simulated)`);
      results.push({ wallet: w.publicKey, status: 'sold', simulated: true });
    }
    return results;
  }

  let tokenProgram;
  try {
    const mintInfo = await conn.getAccountInfo(mintPk, 'confirmed');
    tokenProgram = mintInfo ? mintInfo.owner : new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  } catch {
    tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  }

  const { buildSell, loadGlobals } = await import('./trade-builder.mjs');
  const globals = await loadGlobals(conn);

  for (const w of wallets) {
    try {
      const kp = toKeypair(w);
      const ata = getAssociatedTokenAddressSync(mintPk, kp.publicKey, true, tokenProgram);
      const bal = await conn.getTokenAccountBalance(ata, 'confirmed').catch(() => null);
      const amount = BigInt(bal?.value?.amount ?? '0');

      if (amount === 0n) {
        results.push({ wallet: w.publicKey, status: 'skipped', tokens: '0' });
        continue;
      }

      const slippage = 20;
      const ixs = await buildSell(conn, globals, mintPk, kp.publicKey, amount, slippage, tokenProgram);

      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      const allIxs = [...priorityIxs(), ...ixs];
      const msg = new TransactionMessage({
        payerKey: kp.publicKey,
        recentBlockhash: blockhash,
        instructions: allIxs,
      }).compileToV0Message();

      const tx = new VersionedTransaction(msg);
      tx.sign([kp]);
      const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });

      log.sell(`${shortKey(w.publicKey)} ALL tokens  sig=${sig.slice(0, 12)}..`);
      results.push({ wallet: w.publicKey, status: 'sold', signature: sig, tokens: amount.toString() });
      await sleep(1500);
    } catch (err) {
      log.error(`sellAll ${shortKey(w.publicKey)} failed: ${err.message}`);
      results.push({ wallet: w.publicKey, status: 'failed', error: err.message });
    }
  }

  return results;
}

import { Keypair, SystemProgram, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import { FEE_RESERVE_LAMPORTS, COMPUTE_UNIT_LIMIT } from './constants.mjs';
import { PRIORITY_FEE } from './config.mjs';
import { logFund, logDrain, logError } from './logger.mjs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function generatePool(count) {
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

export function toKeypair(w) {
  return Keypair.fromSecretKey(bs58.decode(w.secretKey));
}

function buildTx(payer, instructions, blockhash) {
  const priorityIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }),
  ];
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [...priorityIxs, ...instructions],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  return tx;
}

export async function sendTx(conn, payer, instructions) {
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tx = buildTx(payer, instructions, blockhash);
  return conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
}

export async function fundPool(conn, masterKeypair, wallets, solPerWallet) {
  const lamports = BigInt(Math.round(solPerWallet * 1e9));
  const results = [];
  for (let i = 0; i < wallets.length; i++) {
    try {
      const ix = SystemProgram.transfer({
        fromPubkey: masterKeypair.publicKey,
        toPubkey: new PublicKey(wallets[i].publicKey),
        lamports,
      });
      const sig = await sendTx(conn, masterKeypair, [ix]);
      results.push({ wallet: wallets[i].publicKey, sol: solPerWallet, status: 'sent', signature: sig });
      logFund(`${wallets[i].publicKey.slice(0, 8)}... ${solPerWallet} SOL`);
      await sleep(500);
    } catch (err) {
      results.push({ wallet: wallets[i].publicKey, status: 'failed', error: err.message });
      logError(`fund ${wallets[i].publicKey.slice(0, 8)}...: ${err.message}`);
    }
  }
  return results;
}

export async function drainPool(conn, wallets, masterKeypair) {
  const results = [];
  for (const w of wallets) {
    try {
      const kp = toKeypair(w);
      const balance = await conn.getBalance(kp.publicKey, 'confirmed');
      if (balance <= 5000) {
        results.push({ wallet: w.publicKey, status: 'skip', reason: 'empty' });
        continue;
      }
      const lamports = BigInt(balance - 5000);
      const ix = SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: masterKeypair.publicKey,
        lamports,
      });
      const sig = await sendTx(conn, kp, [ix]);
      const sol = Number(lamports) / 1e9;
      results.push({ wallet: w.publicKey, sol, status: 'sent', signature: sig });
      logDrain(`${w.publicKey.slice(0, 8)}... ${sol.toFixed(4)} SOL`);
      await sleep(300);
    } catch (err) {
      results.push({ wallet: w.publicKey, status: 'failed', error: err.message });
      logError(`drain ${w.publicKey.slice(0, 8)}...: ${err.message}`);
    }
  }
  return results;
}

export async function getTokenProgram(conn, mint) {
  const info = await conn.getAccountInfo(new PublicKey(mint), 'confirmed');
  return info ? info.owner : TOKEN_PROGRAM_ID;
}

export async function getBalances(conn, wallets, mint) {
  const mintPk = new PublicKey(mint);
  const tokenProgram = await getTokenProgram(conn, mint);
  const result = [];
  for (const w of wallets) {
    const pk = new PublicKey(w.publicKey);
    const sol = await conn.getBalance(pk, 'confirmed').catch(() => 0);
    let tokens = 0n;
    try {
      const ata = getAssociatedTokenAddressSync(mintPk, pk, true, tokenProgram);
      const bal = await conn.getTokenAccountBalance(ata, 'confirmed');
      tokens = BigInt(bal.value.amount);
    } catch {}
    result.push({ wallet: w.publicKey, sol: sol / 1e9, tokens });
  }
  return result;
}

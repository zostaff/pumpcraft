import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction } from '@solana/spl-token';
import { getTokenProgram, sendTx, toKeypair } from './wallet-pool.mjs';
import { logMaker, logError } from './logger.mjs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function distributeDust(conn, sourceKeypair, wallets, mint, amountPerWallet, { batchSize = 10, dryRun = false } = {}) {
  const mintPk = new PublicKey(mint);
  const tokenProgram = await getTokenProgram(conn, mint);
  const results = [];

  for (let i = 0; i < wallets.length; i += batchSize) {
    const batch = wallets.slice(i, i + batchSize);

    for (const w of batch) {
      try {
        const destPk = new PublicKey(w.publicKey);
        const sourceAta = getAssociatedTokenAddressSync(mintPk, sourceKeypair.publicKey, true, tokenProgram);
        const destAta = getAssociatedTokenAddressSync(mintPk, destPk, true, tokenProgram);

        const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
          sourceKeypair.publicKey, destAta, destPk, mintPk, tokenProgram,
        );
        const transferIx = createTransferInstruction(
          sourceAta, destAta, sourceKeypair.publicKey, amountPerWallet, [], tokenProgram,
        );

        if (dryRun) {
          logMaker(`[DRY] dust → ${w.publicKey.slice(0, 8)}... (${amountPerWallet} tokens)`);
          results.push({ wallet: w.publicKey, status: 'dry-run', amount: amountPerWallet.toString() });
        } else {
          const sig = await sendTx(conn, sourceKeypair, [createAtaIx, transferIx]);
          logMaker(`dust → ${w.publicKey.slice(0, 8)}... (${amountPerWallet} tokens) sig=${sig.slice(0, 12)}...`);
          results.push({ wallet: w.publicKey, status: 'sent', signature: sig, amount: amountPerWallet.toString() });
        }
      } catch (err) {
        logError(`dust → ${w.publicKey.slice(0, 8)}...: ${err.message}`);
        results.push({ wallet: w.publicKey, status: 'failed', error: err.message });
      }
    }

    if (i + batchSize < wallets.length) {
      logMaker(`batch ${Math.floor(i / batchSize) + 1} done, waiting 1s...`);
      await sleep(1000);
    }
  }

  return results;
}

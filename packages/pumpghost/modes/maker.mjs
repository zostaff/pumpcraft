import { Connection, Keypair, SystemProgram, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { RPC_URL, WALLET_PRIVATE_KEY, DRY_RUN, MAKER_TARGET_HOLDERS, MAKER_DUST_AMOUNT, MAKER_BATCH_SIZE } from '../lib/config.mjs';
import { generatePool, fundPool, toKeypair, sendTx, getTokenProgram } from '../lib/wallet-pool.mjs';
import { distributeDust } from '../lib/dust.mjs';
import { executeBuy } from '../lib/trade.mjs';
import { logMaker, logInfo, logOk, logError } from '../lib/logger.mjs';
import { createJob, persistJob, printStats } from './common.mjs';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runMaker(opts = {}) {
  const mint = opts.mint;
  if (!mint) throw new Error('--mint required');

  const targetHolders = opts.holders || MAKER_TARGET_HOLDERS;
  const dustAmount = opts.dustAmount ? BigInt(opts.dustAmount) : MAKER_DUST_AMOUNT;
  const batchSize = opts.batchSize || MAKER_BATCH_SIZE;
  const dryRun = opts.dryRun ?? DRY_RUN;
  const buyFirst = opts.buyFirst || 0;

  const conn = new Connection(RPC_URL, 'confirmed');
  const masterKeypair = Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY));

  logInfo(`MAKER MODE — ${mint.slice(0, 12)}...`);
  logInfo(`target holders: ${targetHolders}, dust: ${dustAmount} tokens, batch: ${batchSize}, dry: ${dryRun}`);

  const holderWallets = generatePool(targetHolders);
  const rentPerWallet = 0.003;
  const totalRent = rentPerWallet * targetHolders;

  const job = createJob('maker', { mint, wallets: holderWallets, targetHolders, dustAmount: dustAmount.toString(), dryRun });
  job.stats = { holders: 0, solSpent: 0, errors: 0 };

  if (buyFirst > 0 && !dryRun) {
    logInfo(`buying ${buyFirst} SOL worth of tokens first...`);
    try {
      const sig = await executeBuy(conn, { publicKey: masterKeypair.publicKey.toBase58(), secretKey: bs58.encode(masterKeypair.secretKey) }, mint, Math.round(buyFirst * 1e9), 15);
      logOk(`bought tokens: ${sig.slice(0, 12)}...`);
      job.stats.solSpent += buyFirst;
    } catch (err) {
      logError(`buy failed: ${err.message}`);
      job.error = `buy failed: ${err.message}`;
      job.status = 'failed';
      persistJob(job);
      return job;
    }
    await sleep(2000);
  }

  if (!dryRun) {
    job.status = 'funding';
    persistJob(job);
    logInfo(`funding ${targetHolders} wallets with ${rentPerWallet} SOL each (${totalRent.toFixed(2)} SOL total for ATA rent)...`);
    await fundPool(conn, masterKeypair, holderWallets, rentPerWallet);
    job.stats.solSpent += totalRent;
    await sleep(2000);
  }

  job.status = 'distributing';
  persistJob(job);
  logInfo(`distributing dust to ${targetHolders} wallets...`);

  const tokenProgram = await getTokenProgram(conn, mint);
  const masterAta = getAssociatedTokenAddressSync(new PublicKey(mint), masterKeypair.publicKey, true, tokenProgram);
  let masterBalance;
  try {
    const bal = await conn.getTokenAccountBalance(masterAta, 'confirmed');
    masterBalance = BigInt(bal.value.amount);
  } catch {
    masterBalance = 0n;
  }

  const totalNeeded = dustAmount * BigInt(targetHolders);
  if (masterBalance < totalNeeded && !dryRun) {
    logError(`not enough tokens: have ${masterBalance}, need ${totalNeeded}`);
    job.error = `not enough tokens: have ${masterBalance}, need ${totalNeeded}`;
    job.status = 'failed';
    persistJob(job);
    return job;
  }

  const results = await distributeDust(conn, masterKeypair, holderWallets, mint, dustAmount, { batchSize, dryRun });

  job.stats.holders = results.filter(r => r.status === 'sent' || r.status === 'dry-run').length;
  job.stats.errors = results.filter(r => r.status === 'failed').length;
  job.trades.push(...results.map(r => ({ type: 'dust', ...r, at: new Date().toISOString() })));

  job.status = 'completed';
  persistJob(job);
  printStats(job);
  return job;
}

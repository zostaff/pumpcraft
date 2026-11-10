import { Keypair, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import { COMPUTE_UNIT_LIMIT, FEE_RESERVE_LAMPORTS, MAX_CONSECUTIVE_ERRORS } from './constants.mjs';
import { PRIORITY_FEE, DRY_RUN, DEFAULT_BUY_BIAS } from './config.mjs';
import { buildBuy, buildSell, loadGlobals, invalidateGlobals, detectTokenProgram, getTokenBalance } from './trade-builder.mjs';
import { log, shortKey, solStr } from './logger.mjs';

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

const STRATEGIES = {
  basic: {
    label: 'Basic',
    desc: 'Equal distribution, simultaneous initial buy, fast 1-3s cycling',
    distribution: 'equal',
    initialDelay: () => 0,
    cycleDelay: () => 1000 + Math.random() * 2000,
  },
  staggered: {
    label: 'Staggered',
    desc: 'Equal distribution, 2-6s staggered initial buy, 2-8s cycling',
    distribution: 'equal',
    initialDelay: () => 2000 + Math.random() * 4000,
    cycleDelay: () => 2000 + Math.random() * 6000,
  },
};

export function getStrategies() {
  return Object.entries(STRATEGIES).map(([key, { label, desc }]) => ({ key, label, desc }));
}

export async function runVolume(conn, opts, job) {
  const {
    masterKeypair,
    mint,
    strategy = 'staggered',
    durationMin = 15,
    buyBias = DEFAULT_BUY_BIAS,
    slippageBps = 1000,
  } = opts;

  const mintPk = new PublicKey(mint);
  const slippage = slippageBps / 100;
  const strat = STRATEGIES[strategy] || STRATEGIES.staggered;
  const wallets = job.wallets;
  let consecutiveErrors = 0;

  try {
    // ------ Paper mode ------
    if (DRY_RUN) {
      await runPaperMode(wallets, strat, job, durationMin, buyBias);
      return;
    }

    // ------ Live mode ------
    const tokenProgram = await detectTokenProgram(conn, mintPk);
    let globals = await loadGlobals(conn);

    // Phase 1: Fund wallets (master -> wallets directly)
    job.status = 'funding';
    const solPerWallet = job.budget / wallets.length;
    const { fundWallets } = await import('./wallet-pool.mjs');
    const fundResults = await fundWallets(conn, masterKeypair, wallets, solPerWallet * 1.15);
    job.trades.push(...fundResults.map(r => ({
      type: 'fund', wallet: r.wallet, sol: r.sol, status: r.status, at: new Date().toISOString(),
    })));

    const funded = fundResults.filter(r => r.status === 'sent' || r.status === 'confirmed').length;
    if (funded < 2) {
      job.status = 'failed';
      job.error = `only ${funded}/${wallets.length} wallets funded`;
      return;
    }
    log.info(`funded ${funded}/${wallets.length} wallets`);
    await sleep(2000);

    // Phase 2: Initial buy (30-50% of balance)
    job.status = 'buying';
    const ws = wallets.map((w, i) => ({
      idx: i, w, kp: toKeypair(w), hasTokens: false, lastUsedAt: 0,
    }));

    log.info(`initial buy — ${strategy} (${wallets.length} wallets)`);

    for (const s of ws) {
      if (job.stopping) break;
      try {
        const balance = await conn.getBalance(s.kp.publicKey, 'confirmed');
        const portion = 0.3 + Math.random() * 0.2;
        const buyLamports = BigInt(Math.floor((balance - Number(FEE_RESERVE_LAMPORTS)) * portion));

        if (buyLamports < 5_000_000n) continue;

        const ixs = await buildBuy(conn, globals, mintPk, s.kp.publicKey, buyLamports, slippage, tokenProgram);
        const sig = await signAndSend(conn, ixs, s.kp);

        s.hasTokens = true;
        job.stats.buys++;
        job.stats.solSpent += Number(buyLamports) / 1e9;
        job.trades.push({
          type: 'initial-buy', wallet: s.w.publicKey,
          sol: Number(buyLamports) / 1e9, status: 'sent',
          signature: sig, at: new Date().toISOString(),
        });
        log.buy(`${shortKey(s.w.publicKey)} ${solStr(buyLamports)} SOL (initial)`);

        const delay = strat.initialDelay();
        if (delay > 0) await sleep(delay);
      } catch (err) {
        job.trades.push({
          type: 'initial-buy', wallet: s.w.publicKey,
          status: 'failed', error: err.message, at: new Date().toISOString(),
        });
        log.error(`initial buy ${shortKey(s.w.publicKey)}: ${err.message}`);
      }
    }

    const boughtCount = ws.filter(s => s.hasTokens).length;
    if (boughtCount === 0) {
      job.status = 'failed';
      job.error = 'no wallet could complete initial buy';
      return;
    }
    log.info(`initial buy done: ${boughtCount}/${wallets.length}`);

    // Phase 3: Volume cycling
    job.status = 'running';
    const endTime = Date.now() + durationMin * 60_000;
    let prevIdx = -1;

    while (Date.now() < endTime && !job.stopping) {
      // Rotate: least recently used, never same as last
      const pool = ws.filter(s => s.idx !== prevIdx);
      pool.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      const pick = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
      prevIdx = pick.idx;
      pick.lastUsedAt = Date.now();

      const isBuy = !pick.hasTokens || Math.random() < buyBias;

      try {
        // Refresh globals every 15 cycles
        if (job.stats.cycles % 15 === 0 && job.stats.cycles > 0) {
          invalidateGlobals();
          globals = await loadGlobals(conn);
        }

        if (isBuy) {
          const balance = await conn.getBalance(pick.kp.publicKey, 'confirmed');
          const buyLamports = BigInt(Math.floor((balance - Number(FEE_RESERVE_LAMPORTS)) * 0.3));
          if (buyLamports < 5_000_000n) { await sleep(1000); continue; }

          const ixs = await buildBuy(conn, globals, mintPk, pick.kp.publicKey, buyLamports, slippage, tokenProgram);
          const sig = await signAndSend(conn, ixs, pick.kp);

          pick.hasTokens = true;
          job.stats.buys++;
          job.stats.solSpent += Number(buyLamports) / 1e9;
          job.trades.push({
            type: 'buy', wallet: pick.w.publicKey,
            sol: Number(buyLamports) / 1e9, status: 'sent',
            signature: sig, at: new Date().toISOString(),
          });
          log.buy(`${shortKey(pick.w.publicKey)} ${solStr(buyLamports)} SOL`);
          consecutiveErrors = 0;
        } else {
          const tokenAmount = await getTokenBalance(conn, mintPk, pick.kp.publicKey, tokenProgram);
          if (tokenAmount === 0n) { pick.hasTokens = false; continue; }

          // Sell 40-70% of holdings
          const sellPct = 40 + Math.floor(Math.random() * 30);
          const sellAmount = tokenAmount * BigInt(sellPct) / 100n;
          if (sellAmount === 0n) continue;

          const ixs = await buildSell(conn, globals, mintPk, pick.kp.publicKey, sellAmount, slippage, tokenProgram);
          const sig = await signAndSend(conn, ixs, pick.kp);

          job.stats.sells++;
          job.trades.push({
            type: 'sell', wallet: pick.w.publicKey,
            tokens: sellAmount.toString(), pct: sellPct, status: 'sent',
            signature: sig, at: new Date().toISOString(),
          });
          log.sell(`${shortKey(pick.w.publicKey)} ${sellPct}% tokens`);
          consecutiveErrors = 0;
        }
      } catch (err) {
        consecutiveErrors++;
        job.trades.push({
          type: isBuy ? 'buy' : 'sell', wallet: pick.w.publicKey,
          status: 'failed', error: err.message, at: new Date().toISOString(),
        });
        log.error(`${isBuy ? 'buy' : 'sell'} ${shortKey(pick.w.publicKey)}: ${err.message}`);

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log.error(`${MAX_CONSECUTIVE_ERRORS} consecutive errors — auto-stopping`);
          job.error = `${MAX_CONSECUTIVE_ERRORS} consecutive errors: ${err.message}`;
          break;
        }
      }

      job.stats.cycles++;
      await sleep(strat.cycleDelay());
    }

    // Cleanup: sell all tokens, drain SOL back
    job.status = 'cleanup';
    log.info('cleanup — selling remaining tokens...');

    const { sellAll, drainWallets } = await import('./wallet-pool.mjs');
    const holding = ws.filter(s => s.hasTokens).map(s => s.w);
    if (holding.length > 0) {
      const sellResults = await sellAll(conn, holding, mint);
      job.trades.push(...sellResults.map(r => ({
        type: 'cleanup-sell', wallet: r.wallet, status: r.status, at: new Date().toISOString(),
      })));
      await sleep(3000);
    }

    log.info('cleanup — draining wallets...');
    const drainResults = await drainWallets(conn, wallets, masterKeypair);
    job.trades.push(...drainResults.map(r => ({
      type: 'drain', wallet: r.wallet, sol: r.sol, status: r.status, at: new Date().toISOString(),
    })));

    job.status = job.stopping ? 'stopped' : 'completed';
    log.job(`done — ${job.stats.buys} buys, ${job.stats.sells} sells, ${job.stats.solSpent.toFixed(4)} SOL spent`);

  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    log.error(`fatal: ${err.message}`);

    try {
      const { sellAll, drainWallets } = await import('./wallet-pool.mjs');
      if (mint) await sellAll(conn, wallets, mint).catch(() => {});
      await drainWallets(conn, wallets, masterKeypair).catch(() => {});
    } catch {}
  }
}

async function runPaperMode(wallets, strat, job, durationMin, buyBias) {
  log.paper('=== PAPER MODE ===');

  // Phase 1: Simulated funding
  job.status = 'funding';
  const solPerWallet = job.budget / wallets.length;
  for (const w of wallets) {
    log.paper(`fund ${shortKey(w.publicKey)} ${solPerWallet.toFixed(4)} SOL`);
    job.trades.push({
      type: 'fund', wallet: w.publicKey, sol: solPerWallet,
      status: 'confirmed', simulated: true, at: new Date().toISOString(),
    });
    await sleep(100);
  }

  // Phase 2: Simulated initial buy
  job.status = 'buying';
  const ws = wallets.map((w, i) => ({
    idx: i, w, hasTokens: false, lastUsedAt: 0,
    solBalance: solPerWallet * 0.85,
    tokenBalance: 0,
  }));

  for (const s of ws) {
    const buyPortion = 0.3 + Math.random() * 0.2;
    const buySol = s.solBalance * buyPortion;
    s.solBalance -= buySol;
    s.tokenBalance = Math.floor(buySol * 1_000_000);
    s.hasTokens = true;

    job.stats.buys++;
    job.stats.solSpent += buySol;
    job.trades.push({
      type: 'initial-buy', wallet: s.w.publicKey,
      sol: buySol, status: 'confirmed', simulated: true, at: new Date().toISOString(),
    });
    log.paper(`buy ${shortKey(s.w.publicKey)} ${buySol.toFixed(4)} SOL`);

    const delay = strat.initialDelay();
    if (delay > 0) await sleep(Math.min(delay, 500));
  }

  // Phase 3: Simulated volume cycling
  job.status = 'running';
  const endTime = Date.now() + durationMin * 60_000;
  let prevIdx = -1;

  while (Date.now() < endTime && !job.stopping) {
    const pool = ws.filter(s => s.idx !== prevIdx);
    pool.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    const pick = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
    prevIdx = pick.idx;
    pick.lastUsedAt = Date.now();

    const isBuy = !pick.hasTokens || Math.random() < buyBias;

    if (isBuy) {
      const buySol = pick.solBalance * (0.1 + Math.random() * 0.2);
      if (buySol < 0.001) { await sleep(200); continue; }
      pick.solBalance -= buySol;
      pick.tokenBalance += Math.floor(buySol * 1_000_000);
      pick.hasTokens = true;
      job.stats.buys++;
      job.stats.solSpent += buySol;
      job.trades.push({
        type: 'buy', wallet: pick.w.publicKey,
        sol: buySol, status: 'confirmed', simulated: true, at: new Date().toISOString(),
      });
      log.paper(`buy ${shortKey(pick.w.publicKey)} ${buySol.toFixed(4)} SOL`);
    } else {
      if (pick.tokenBalance <= 0) { pick.hasTokens = false; continue; }
      const sellPct = 40 + Math.floor(Math.random() * 30);
      const sellTokens = Math.floor(pick.tokenBalance * sellPct / 100);
      const solReturn = sellTokens / 1_000_000 * 0.95;
      pick.tokenBalance -= sellTokens;
      pick.solBalance += solReturn;
      if (pick.tokenBalance <= 0) pick.hasTokens = false;
      job.stats.sells++;
      job.trades.push({
        type: 'sell', wallet: pick.w.publicKey,
        pct: sellPct, status: 'confirmed', simulated: true, at: new Date().toISOString(),
      });
      log.paper(`sell ${shortKey(pick.w.publicKey)} ${sellPct}%`);
    }

    job.stats.cycles++;
    const delay = strat.cycleDelay();
    await sleep(Math.min(delay, 300));
  }

  // Simulated cleanup
  job.status = 'cleanup';
  for (const s of ws) {
    if (s.tokenBalance > 0) {
      job.trades.push({
        type: 'cleanup-sell', wallet: s.w.publicKey,
        status: 'confirmed', simulated: true, at: new Date().toISOString(),
      });
    }
    job.trades.push({
      type: 'drain', wallet: s.w.publicKey,
      sol: s.solBalance, status: 'confirmed', simulated: true, at: new Date().toISOString(),
    });
  }

  job.status = job.stopping ? 'stopped' : 'completed';
  log.paper(`done — ${job.stats.buys} buys, ${job.stats.sells} sells, ${job.stats.solSpent.toFixed(4)} SOL spent`);
}

async function signAndSend(conn, instructions, signer) {
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const allIxs = [...priorityIxs(), ...instructions];

  const msg = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([signer]);
  return conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
}

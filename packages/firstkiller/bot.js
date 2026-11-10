#!/usr/bin/env node

import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './lib/config.js';
import { log } from './lib/logger.js';
import { LogListener } from './lib/listener.js';
import { classifyLogMessages, extractTradeEventsFromLogs } from './lib/parser.js';
import { calculateTokensOut } from './lib/bonding.js';
import { buildBuyTransaction } from './lib/tx-builder.js';
import { sendBundle } from './lib/jito.js';
import { PositionManager } from './lib/positions.js';
import { LAMPORTS_PER_SOL } from './lib/constants.js';

const DRY_RUN = process.argv.includes('--dry-run');
let lastBuyTime = 0;
const seenMints = new Map(); // mint → timestamp

function pruneSeenMints() {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [mint, ts] of seenMints) {
    if (ts < cutoff) seenMints.delete(mint);
  }
}

function validateConfig() {
  const required = ['rpcWss', 'rpcUrl'];
  if (!DRY_RUN) required.push('walletKey');

  for (const key of required) {
    if (!config[key]) {
      log.error(`Missing required config: ${key}`);
      process.exit(1);
    }
  }
}

function loadWallet() {
  if (DRY_RUN && !config.walletKey) {
    const kp = Keypair.generate();
    log.warn(`No wallet key provided — using ephemeral keypair: ${kp.publicKey.toBase58()}`);
    return kp;
  }
  try {
    const secret = bs58.decode(config.walletKey);
    return Keypair.fromSecretKey(secret);
  } catch {
    log.error('Invalid WALLET_PRIVATE_KEY (expected base58)');
    process.exit(1);
  }
}

async function handleLog(value, connection, payer, positions) {
  const { logs, signature } = value;
  if (!logs || logs.length === 0) return;

  const { isCreate } = classifyLogMessages(logs);
  if (!isCreate) return;

  const events = extractTradeEventsFromLogs(logs);
  if (events.length === 0) return;

  const event = events[0];
  const mint = event.mint;

  if (seenMints.has(mint)) return;
  seenMints.set(mint, Date.now());

  log.create(mint);

  // BondingCurveV3 instruction does the dev buy internally —
  // there's no separate Buy instruction in the logs.
  // The trade event's solAmount IS the dev buy.
  if (event.solAmount <= 0) {
    log.filter('no dev buy (solAmount = 0)', mint);
    return;
  }

  if (event.solAmount < config.minDevBuy) {
    log.filter(`dev buy too small: ${event.solAmount.toFixed(4)} SOL < ${config.minDevBuy} SOL`, mint);
    return;
  }

  log.devBuy(event.solAmount);

  if (positions.activeCount >= config.maxPositions) {
    log.filter('max positions reached', mint);
    return;
  }

  const now = Date.now();
  if (now - lastBuyTime < config.cooldownSec * 1000) {
    log.filter('cooldown active', mint);
    return;
  }

  // Use reserves from the trade event directly — avoids an RPC roundtrip
  // which is critical for backrun speed. The event's reserves reflect
  // the state AFTER the dev buy, which is exactly what we need.
  const vSol = event.virtualSolReserves;
  const vTok = event.virtualTokenReserves;

  if (vSol === 0 || vTok === 0) {
    log.filter('invalid reserves in trade event', mint);
    return;
  }

  const solAmountLamports = Math.floor(config.buySol * LAMPORTS_PER_SOL);
  const jitoTipLamports = Math.floor(config.jitoTip * LAMPORTS_PER_SOL);
  const tokensOut = calculateTokensOut(solAmountLamports, vSol, vTok);

  log.buy(mint, config.buySol, config.jitoTip);
  log.debug(`Expected tokens: ${tokensOut.toLocaleString()} | Price: ${(vSol / vTok).toFixed(12)}`);

  const entryPrice = vSol / vTok;

  if (DRY_RUN) {
    log.debug(`[DRY] Would buy ${config.buySol} SOL of ${mint.slice(0, 8)}...`);
    positions.add(mint, entryPrice, tokensOut, config.buySol);
    lastBuyTime = Date.now();
    return;
  }

  try {
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = buildBuyTransaction({
      payer,
      mint,
      solAmountLamports,
      virtualSolReserves: vSol,
      virtualTokenReserves: vTok,
      slippageBps: 500,
      recentBlockhash: blockhash,
      jitoTipLamports,
    });

    const bundleId = await sendBundle([tx]);
    if (bundleId) {
      positions.add(mint, entryPrice, tokensOut, config.buySol);
      lastBuyTime = Date.now();
    }
  } catch (err) {
    log.error(`Buy failed: ${err.message}`);
  }
}

async function main() {
  log.banner();

  if (DRY_RUN) log.dryRun();

  validateConfig();

  const payer = loadWallet();
  const connection = new Connection(config.rpcUrl, 'confirmed');

  log.info(`Wallet: ${payer.publicKey.toBase58()}`);
  log.info(`Buy: ${config.buySol} SOL | Tip: ${config.jitoTip} SOL`);
  log.info(`TP: ${config.takeProfit}x | SL: ${config.stopLoss}x | Timeout: ${config.timeoutSec}s`);
  log.info(`Min dev buy: ${config.minDevBuy} SOL | Max positions: ${config.maxPositions}`);
  log.info(`Cooldown: ${config.cooldownSec}s`);

  if (!DRY_RUN) {
    try {
      const balance = await connection.getBalance(payer.publicKey);
      log.info(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      if (balance < config.buySol * LAMPORTS_PER_SOL * 1.1) {
        log.warn('Balance may be too low for trading!');
      }
    } catch (err) {
      log.warn(`Could not fetch balance: ${err.message}`);
    }
  }

  const positions = new PositionManager(connection, payer, DRY_RUN);
  positions.startMonitor(3000);

  const listener = new LogListener(config.rpcWss, (value) => {
    handleLog(value, connection, payer, positions).catch(err => {
      log.error(`Handler error: ${err.message}`);
    });
  });

  listener.start();

  log.success('Bot is running — listening for new pump.fun tokens...\n');

  const statsInterval = setInterval(() => {
    pruneSeenMints();
    if (positions.totalBuys > 0) positions.printStats();
  }, 30_000);

  const cleanup = () => {
    log.warn('Shutting down...');
    listener.stop();
    positions.stopMonitor();
    clearInterval(statsInterval);
    positions.printStats();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(err => {
  log.error(`Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});

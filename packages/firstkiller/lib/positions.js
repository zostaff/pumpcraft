import { Connection } from '@solana/web3.js';
import { config } from './config.js';
import { log } from './logger.js';
import { deriveBondingCurve } from './pda.js';
import { fetchBondingCurveState } from './bonding.js';
import { buildSellTransaction } from './tx-builder.js';
import { sendBundle } from './jito.js';
import { LAMPORTS_PER_SOL } from './constants.js';

const RPC_DELAY_MS = 200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class PositionManager {
  constructor(connection, payer, dryRun = false) {
    this.connection = connection;
    this.payer = payer;
    this.dryRun = dryRun;
    this.positions = new Map();
    this.totalBuys = 0;
    this.totalSells = 0;
    this.totalPnl = 0;
    this._interval = null;
    this._checking = false;
  }

  get activeCount() {
    return this.positions.size;
  }

  add(mint, entryPrice, tokenAmount, solSpent) {
    this.positions.set(mint, {
      mint,
      entryPrice,
      tokenAmount,
      solSpent,
      openedAt: Date.now(),
    });
    this.totalBuys++;
    log.info(`Position opened: ${mint.slice(0, 8)}... | ${tokenAmount} tokens | ${solSpent} SOL`);
  }

  async checkAll() {
    if (this._checking) return;
    this._checking = true;
    try {
      const entries = [...this.positions];
      for (let i = 0; i < entries.length; i++) {
        const [mint, pos] = entries[i];
        try {
          await this._checkPosition(mint, pos);
        } catch (err) {
          log.error(`Position check failed for ${mint.slice(0, 8)}...: ${err.message}`);
        }
        if (i < entries.length - 1) await sleep(RPC_DELAY_MS);
      }
    } finally {
      this._checking = false;
    }
  }

  async _checkPosition(mint, pos) {
    const elapsed = Math.floor((Date.now() - pos.openedAt) / 1000);
    const bondingCurvePda = deriveBondingCurve(mint);
    const state = await fetchBondingCurveState(this.connection, bondingCurvePda);

    if (!state) {
      log.warn(`Cannot fetch bonding curve for ${mint.slice(0, 8)}...`);
      return;
    }

    if (state.complete) {
      log.warn(`Token ${mint.slice(0, 8)}... graduated — force selling`);
      await this._sell(mint, pos, state, 'graduated');
      return;
    }

    const currentPrice = state.price;
    const pnlRatio = (currentPrice - pos.entryPrice) / pos.entryPrice;

    log.position(mint, currentPrice, pos.entryPrice, elapsed);

    if (pnlRatio >= config.takeProfit - 1) {
      await this._sell(mint, pos, state, 'take-profit');
    } else if (pnlRatio <= -(1 - config.stopLoss)) {
      await this._sell(mint, pos, state, 'stop-loss');
    } else if (elapsed >= config.timeoutSec) {
      await this._sell(mint, pos, state, 'timeout');
    }
  }

  async _sell(mint, pos, state, reason) {
    const pnlRatio = (state.price - pos.entryPrice) / pos.entryPrice;
    log.sell(mint, pnlRatio);
    log.info(`Sell reason: ${reason}`);

    if (!this.dryRun) {
      try {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        const tx = buildSellTransaction({
          payer: this.payer,
          mint,
          tokenAmount: pos.tokenAmount,
          virtualSolReserves: state.virtualSolReserves,
          virtualTokenReserves: state.virtualTokenReserves,
          slippageBps: 1000,
          recentBlockhash: blockhash,
          jitoTipLamports: Math.floor(config.jitoTip * LAMPORTS_PER_SOL),
        });
        await sendBundle([tx]);
      } catch (err) {
        log.error(`Sell tx failed: ${err.message}`);
      }
    } else {
      log.debug(`[DRY] Would sell ${pos.tokenAmount} tokens of ${mint.slice(0, 8)}...`);
    }

    const solPnl = pos.solSpent * pnlRatio;
    this.totalPnl += solPnl;
    this.totalSells++;
    this.positions.delete(mint);
  }

  startMonitor(intervalMs = 3000) {
    if (this._interval) return;
    this._interval = setInterval(() => this.checkAll(), intervalMs);
    log.debug(`Position monitor started (${intervalMs}ms interval)`);
  }

  stopMonitor() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  printStats() {
    log.stats(this.activeCount, this.totalBuys, this.totalSells, this.totalPnl);
  }
}

// listener.mjs — stream new blocks forward from the chain tip.
//
// Public RPC WebSocket block subscriptions are often disabled, so this uses a
// robust polling walk: track the latest confirmed slot, then fetch each new
// slot's block in order (rate-limited + cached in rpc.mjs). Emits 'block'.
import { EventEmitter } from 'node:events';
import { connection, getBlockCached } from './rpc.mjs';
import { log } from './logger.mjs';

export class BlockListener extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {number} [opts.pollMs=1200]   how often to check for new slots
   * @param {number} [opts.maxBacklog=8]  cap slots fetched per tick (rate guard)
   * @param {number} [opts.startSlot]     slot to start from (default: tip)
   */
  constructor(opts = {}) {
    super();
    this.pollMs = opts.pollMs ?? 1200;
    this.maxBacklog = opts.maxBacklog ?? 8;
    this.startSlot = opts.startSlot;
    this.cursor = null;
    this.running = false;
    this._timer = null;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    try {
      this.cursor = this.startSlot ?? (await connection.getSlot('confirmed'));
    } catch (err) {
      this.emit('error', err);
      this.running = false;
      return;
    }
    log.info('listener: starting at slot', this.cursor);
    this._tick();
  }

  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  async _tick() {
    if (!this.running) return;
    try {
      const tip = await connection.getSlot('confirmed');
      let fetched = 0;
      while (this.cursor < tip && fetched < this.maxBacklog && this.running) {
        const slot = this.cursor + 1;
        const block = await getBlockCached(slot);
        this.cursor = slot;
        fetched++;
        if (block) this.emit('block', { slot, block });
      }
      if (this.cursor < tip) {
        this.emit('lag', { behind: tip - this.cursor });
      }
    } catch (err) {
      this.emit('error', err);
    } finally {
      if (this.running) this._timer = setTimeout(() => this._tick(), this.pollMs);
    }
  }
}

export default { BlockListener };

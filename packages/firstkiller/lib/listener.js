import WebSocket from 'ws';
import { PUMP_PROGRAM } from './constants.js';
import { log } from './logger.js';

export class LogListener {
  constructor(wssUrl, onLog) {
    this.wssUrl = wssUrl;
    this.onLog = onLog;
    this.ws = null;
    this.subId = null;
    this._reconnectDelay = 1000;
  }

  start() {
    this._connect();
  }

  _connect() {
    log.info(`Connecting to WebSocket: ${this.wssUrl.replace(/api-key=[^&]+/, 'api-key=***')}`);
    this.ws = new WebSocket(this.wssUrl);

    this.ws.on('open', () => {
      log.success('WebSocket connected');
      this._subscribe();
      this._reconnectDelay = 1000;
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.method === 'logsNotification') {
          const value = msg.params?.result?.value;
          if (value) {
            this.onLog(value);
          }
        } else if (msg.result !== undefined && !msg.error) {
          this.subId = msg.result;
          log.success(`Subscribed to pump.fun logs (sub ID: ${this.subId})`);
        } else if (msg.error) {
          log.error(`RPC error: ${JSON.stringify(msg.error)}`);
        }
      } catch (err) {
        log.error(`WS parse error: ${err.message}`);
      }
    });

    this.ws.on('close', () => {
      log.warn('WebSocket disconnected, reconnecting...');
      setTimeout(() => this._connect(), this._reconnectDelay);
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30_000);
    });

    this.ws.on('error', (err) => {
      log.error(`WebSocket error: ${err.message}`);
    });
  }

  _subscribe() {
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        { mentions: [PUMP_PROGRAM.toBase58()] },
        { commitment: 'processed' },
      ],
    };
    this.ws.send(JSON.stringify(req));
    log.debug(`Subscribing to logs for ${PUMP_PROGRAM.toBase58()}`);
  }

  stop() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

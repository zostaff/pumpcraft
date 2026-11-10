import WebSocket from "ws";
import { WS_URL } from "./config.mjs";

export class SolanaWs {
  constructor(url = WS_URL) {
    this.url = url;
    this.ws = null;
    this.id = 0;
    this.subs = new Map();
    this.handlers = new Map();
    this.reconnectMs = 3000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on("open", () => {
        console.log("[ws] connected");
        for (const [id, { method, params, handler }] of this.subs) {
          this._send(method, params, id);
        }
        resolve();
      });
      this.ws.on("message", (raw) => {
        const msg = JSON.parse(raw);
        if (msg.method === "logsNotification" || msg.method === "accountNotification") {
          const subId = msg.params?.subscription;
          const handler = this.handlers.get(subId);
          if (handler) handler(msg.params.result);
        }
        if (msg.result && typeof msg.result === "number") {
          const pending = this.subs.get(msg.id);
          if (pending) {
            this.handlers.set(msg.result, pending.handler);
            pending.subId = msg.result;
          }
        }
      });
      this.ws.on("close", () => {
        console.log("[ws] disconnected, reconnecting...");
        setTimeout(() => this.connect(), this.reconnectMs);
      });
      this.ws.on("error", (err) => {
        console.error("[ws] error:", err.message);
        reject(err);
      });
    });
  }

  _send(method, params, id) {
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  }

  subscribeLogs(programId, handler, commitment = "confirmed") {
    const id = ++this.id;
    const method = "logsSubscribe";
    const params = [{ mentions: [programId] }, { commitment }];
    this.subs.set(id, { method, params, handler });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send(method, params, id);
    }
    return id;
  }

  subscribeAccount(pubkey, handler, commitment = "confirmed") {
    const id = ++this.id;
    const method = "accountSubscribe";
    const params = [pubkey, { encoding: "jsonParsed", commitment }];
    this.subs.set(id, { method, params, handler });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send(method, params, id);
    }
    return id;
  }

  close() {
    this.ws?.close();
  }
}

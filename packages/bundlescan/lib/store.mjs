// store.mjs — tiny append-only JSONL store for detections, shared by the
// scanner (writer) and stats / dashboard (readers). BigInt-safe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'detections.jsonl');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function replacer(_key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

/** Append one detection record. Adds a wall-clock timestamp if absent. */
export function append(record) {
  ensureDir();
  const row = { ts: record.ts ?? Date.now(), ...record };
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(row, replacer) + '\n');
}

/** Read all records, optionally filtered by a predicate. Newest last. */
export function readAll(filter) {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  const lines = fs.readFileSync(EVENTS_FILE, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (!filter || filter(rec)) out.push(rec);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

/** Records within the last `hours`. */
export function readSince(hours) {
  const cutoff = Date.now() - hours * 3600_000;
  return readAll((r) => (r.ts ?? 0) >= cutoff);
}

/** Most recent `n` records, newest first. */
export function recent(n = 50, type) {
  const all = readAll(type ? (r) => r.type === type : undefined);
  return all.slice(-n).reverse();
}

export const paths = { DATA_DIR, EVENTS_FILE };
export default { append, readAll, readSince, recent, paths };

// config.mjs — loads .env and exposes a typed config object.
import dotenv from 'dotenv';
dotenv.config();

function str(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function list(name, fallback = []) {
  const v = process.env[name];
  if (!v) return fallback;
  return v
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// If a Helius key is set and RPC_URL is left at the public default, prefer Helius.
const heliusKey = str('HELIUS_API_KEY');
let rpcUrl = str('RPC_URL', 'https://api.mainnet-beta.solana.com');
let rpcWss = str('RPC_WSS', 'wss://api.mainnet-beta.solana.com');
if (heliusKey && /api\.mainnet-beta\.solana\.com/.test(rpcUrl)) {
  rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
  rpcWss = `wss://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
}

export const config = {
  rpcUrl,
  rpcWss,
  heliusKey,
  scanMinProfit: num('SCAN_MIN_PROFIT', 0.01),
  scanPrograms: list('SCAN_PROGRAMS', ['pumpfun', 'pumpswap', 'raydium', 'orca']),
  dashboardPort: num('DASHBOARD_PORT', 3001),
  guardWallet: str('GUARD_WALLET'),
  guardAlertThreshold: num('GUARD_ALERT_THRESHOLD', 0.01),
  simDefaultAmount: num('SIM_DEFAULT_AMOUNT', 0.5),
  // Rate limiting: cap getBlock throughput.
  maxBlocksPerSec: 5,
};

export default config;

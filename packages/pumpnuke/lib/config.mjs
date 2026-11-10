import 'dotenv/config';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
export const DRY_RUN = process.env.DRY_RUN !== 'false';
export const DEFAULT_STRATEGY = process.env.DEFAULT_STRATEGY || 'staggered';
export const DEFAULT_WALLETS = parseInt(process.env.DEFAULT_WALLETS || '8', 10);
export const DEFAULT_BUDGET = parseFloat(process.env.DEFAULT_BUDGET || '0.5');
export const DEFAULT_DURATION_MIN = parseInt(process.env.DEFAULT_DURATION_MIN || '15', 10);
export const DEFAULT_BUY_BIAS = parseFloat(process.env.DEFAULT_BUY_BIAS || '0.6');
export const DEFAULT_SLIPPAGE_BPS = parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '1000', 10);
export const PRIORITY_FEE = parseInt(process.env.PRIORITY_FEE || '300000', 10);
export const JITO_TIP = parseFloat(process.env.JITO_TIP || '0.0001');
export const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || '3002', 10);
export const SOL_RESERVE = parseFloat(process.env.SOL_RESERVE || '0.01');

export function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

export function getMasterKeypair() {
  const key = process.env.WALLET_PRIVATE_KEY;
  if (!key) return null;
  return Keypair.fromSecretKey(bs58.decode(key));
}

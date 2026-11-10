import 'dotenv/config';

export const RPC_URL            = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
export const HELIUS_API_KEY     = process.env.HELIUS_API_KEY || '';
export const SCAN_TX_LIMIT      = Number(process.env.SCAN_TX_LIMIT) || 500;
export const SCAN_HOLDER_LIMIT  = Number(process.env.SCAN_HOLDER_LIMIT) || 1000;
export const FUNDING_TRACE_DEPTH = Number(process.env.FUNDING_TRACE_DEPTH) || 2;
export const DASHBOARD_PORT     = Number(process.env.DASHBOARD_PORT) || 3003;

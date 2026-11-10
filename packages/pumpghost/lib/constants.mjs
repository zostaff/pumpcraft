import { PublicKey } from '@solana/web3.js';

export const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMP_AMM_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

export const TRADE_EVENT_PREFIX = 'bddb7fd34ee661ee';
export const PUMPSWAP_TRADE_PREFIX = '67f4521f2cf57777';

export const JITO_TIP_ACCOUNTS = new Set([
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4bPg7v3Nit2hAZNRcJL1rRx',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSLtrihvYF8i8nQafEe',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
]);

export const MICRO_BUY_MAX_SOL = 0.01;
export const MICRO_BUY_MIN_SOL = 0.0005;
export const DUST_THRESHOLD_TOKENS = 100n;
export const RENT_SOL_APPROX = 0.00203;
export const FRESH_WALLET_MAX_AGE_H = 24;
export const FRESH_WALLET_MAX_TXS = 10;

export function bondingCurvePda(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  );
  return pda;
}

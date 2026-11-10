import { PublicKey } from '@solana/web3.js';

export const COMPUTE_UNIT_LIMIT = 250_000;
export const TX_SIZE_LIMIT = 1232;
export const FEE_RESERVE_LAMPORTS = 10_000_000n;
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const MAX_CONSECUTIVE_ERRORS = 5;

export const JITO_ENDPOINT = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

export const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4bPg7v3Nit2hAZNRcJL1rRx',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSLtrihvYF8i8nQafEe',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

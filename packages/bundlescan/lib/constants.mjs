// constants.mjs — program IDs, known tip accounts, discriminators.
// All values are public, on-chain identifiers used for decoding and classification.

export const LAMPORTS_PER_SOL = 1_000_000_000n;

// --- DEX / AMM program IDs ---
export const PROGRAMS = {
  PUMPFUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PUMPSWAP: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
  RAYDIUM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  SYSTEM: '11111111111111111111111111111111',
  TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
};

// Map a program id back to a friendly label.
export const PROGRAM_LABELS = Object.fromEntries(
  Object.entries(PROGRAMS).map(([k, v]) => [v, k])
);

// Which config-level program names map to which on-chain ids.
export const PROGRAM_BY_NAME = {
  pumpfun: PROGRAMS.PUMPFUN,
  pumpswap: PROGRAMS.PUMPSWAP,
  raydium: PROGRAMS.RAYDIUM_V4,
  orca: PROGRAMS.ORCA_WHIRLPOOL,
  jupiter: PROGRAMS.JUPITER,
};

// --- Known Jito tip accounts (public) ---
// A transfer to one of these in the same slot is a strong bundle signal.
export const JITO_TIP_ACCOUNTS = new Set([
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
]);

// Other block-builder tip services recognised by address prefix.
export const TIP_PREFIXES = [
  { name: 'astralane', prefix: 'astr' },
  { name: 'nozomi', prefix: 'noz' },
];

export function tipServiceFor(address) {
  if (JITO_TIP_ACCOUNTS.has(address)) return 'jito';
  for (const { name, prefix } of TIP_PREFIXES) {
    if (address.toLowerCase().startsWith(prefix)) return name;
  }
  return null;
}

// --- pump.fun V3 trade event layout ---
// Anchor "event" self-CPI log, prefixed with the trade event discriminator.
export const PUMPFUN_TRADE_EVENT_PREFIX = 'bddb7fd34ee661ee';
export const PUMPFUN_TRADE_EVENT_LAYOUT = {
  disc: [0, 8],
  mint: [8, 40],
  solAmount: [40, 48],
  tokenAmount: [48, 56],
  user: [57, 89],
  virtualSolReserves: [97, 105],
  virtualTokenReserves: [105, 113],
};

// --- PumpSwap AMM ---
export const PUMPSWAP_TRADE_EVENT_PREFIX = '67f4521f2cf57777';
export const PUMPSWAP_BUY_DISC = '66063d1201daebea';
export const PUMPSWAP_SELL_DISC = '33e685a4017f83ad';

// Log-message instruction names that indicate trade direction.
export const BUY_LOG_NAMES = ['Buy', 'BuyV2', 'BuyV3'];
export const SELL_LOG_NAMES = ['Sell', 'SellV2', 'SellV3'];

export default {
  LAMPORTS_PER_SOL,
  PROGRAMS,
  PROGRAM_LABELS,
  PROGRAM_BY_NAME,
  JITO_TIP_ACCOUNTS,
  TIP_PREFIXES,
  tipServiceFor,
  PUMPFUN_TRADE_EVENT_PREFIX,
  PUMPFUN_TRADE_EVENT_LAYOUT,
  PUMPSWAP_TRADE_EVENT_PREFIX,
  PUMPSWAP_BUY_DISC,
  PUMPSWAP_SELL_DISC,
  BUY_LOG_NAMES,
  SELL_LOG_NAMES,
};

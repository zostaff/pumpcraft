import { PublicKey } from "@solana/web3.js";

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
export const PUMP_FEE_RECIPIENT = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJ5tGLDMDSRp");
export const PUMP_EVENT_AUTH = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
export const PUMP_FEE_CONFIG = new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");

export const PUMPSWAP_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
export const RENT_PROGRAM = new PublicKey("SysvarRent111111111111111111111111111111111");
export const COMPUTE_BUDGET = new PublicKey("ComputeBudget111111111111111111111111111111");

export const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

export const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
].map((a) => new PublicKey(a));

// V3 (current) event prefixes
export const TRADE_EVENT_PREFIX = Buffer.from("bddb7fd34ee661ee", "hex");
export const FEE_EVENT_PREFIX = Buffer.from("31487b2d6e40b085", "hex");
export const FEE_DISTRIBUTE_PREFIX = Buffer.from("e3bed7ceb0b4a584", "hex");

// PumpSwap AMM event prefixes
export const PUMPSWAP_TRADE_PREFIX = Buffer.from("67f4521f2cf57777", "hex");
export const PUMPSWAP_FEE_PREFIX = Buffer.from("3e2f370aa503dc2a", "hex");

// V2 (legacy) prefixes — kept for historical data analysis
export const TRADE_EVENT_PREFIX_V2 = Buffer.from("e445a52e51cb9a1d", "hex");
export const CREATE_EVENT_PREFIX_V2 = Buffer.from("1b72a94ddeef6e60", "hex");

// Buy/sell/create determined from instruction names in logs
export const BUY_INSTRUCTIONS = new Set([
  "Buy", "BuyV2", "BuyV3", "BuyExactQuoteInV2", "BuyExactQuoteInV3", "BuyExactSolIn",
]);
export const SELL_INSTRUCTIONS = new Set([
  "Sell", "SellV2", "SellV3",
]);
export const CREATE_INSTRUCTIONS = new Set([
  "BondingCurveV3", "BondingCurveJupiter",
]);
export const GRADUATION_INSTRUCTIONS = new Set([
  "MigrateBondingCurveCreator",
]);

// PumpSwap AMM instruction discriminators
export const PUMPSWAP_BUY_DISC = Buffer.from("66063d1201daebea", "hex");
export const PUMPSWAP_SELL_DISC = Buffer.from("33e685a4017f83ad", "hex");

// Bonding curve graduation threshold (~85 SOL virtual reserves)
export const GRADUATION_VIRTUAL_SOL = 85_000_000_000n;

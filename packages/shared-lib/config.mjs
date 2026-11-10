import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

export const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
export const WS_URL = RPC_URL.replace("https://", "wss://").replace("http://", "ws://");
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";

export const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || 500);
export const CU_PRICE = Number(process.env.CU_PRICE || 1_500_000);
export const CU_LIMIT = Number(process.env.CU_LIMIT || 80_000);
export const TIP_SOL = Number(process.env.TIP_SOL || 0.0001);

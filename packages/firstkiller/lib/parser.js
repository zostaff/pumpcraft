import { PublicKey } from '@solana/web3.js';
import {
  TRADE_EVENT_PREFIX,
  CREATE_INSTRUCTIONS,
  BUY_INSTRUCTIONS,
  SELL_INSTRUCTIONS,
  LAMPORTS_PER_SOL,
} from './constants.js';

export function parseTradeEvent(base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  if (buf.length < 113) return null;

  const disc = buf.subarray(0, 8).toString('hex');
  if (disc !== TRADE_EVENT_PREFIX) return null;

  const mint              = new PublicKey(buf.subarray(8, 40));
  const solAmount         = buf.readBigUInt64LE(40);
  const tokenAmount       = buf.readBigUInt64LE(48);
  const user              = new PublicKey(buf.subarray(57, 89));
  const virtualSolReserves   = buf.readBigUInt64LE(97);
  const virtualTokenReserves = buf.readBigUInt64LE(105);

  return {
    mint:                 mint.toBase58(),
    mintPubkey:           mint,
    solAmount:            Number(solAmount) / LAMPORTS_PER_SOL,
    solAmountLamports:    solAmount,
    tokenAmount:          Number(tokenAmount),
    user:                 user.toBase58(),
    virtualSolReserves:   Number(virtualSolReserves),
    virtualTokenReserves: Number(virtualTokenReserves),
    price:                Number(virtualSolReserves) / Number(virtualTokenReserves),
  };
}

export function classifyLogMessages(logs) {
  let isCreate = false;
  let isBuy = false;
  let isSell = false;
  let instructionName = null;

  for (const line of logs) {
    const invokeMatch = line.match(/^Program log: Instruction: (\w+)/);
    if (invokeMatch) {
      const name = invokeMatch[1];
      instructionName = name;
      if (CREATE_INSTRUCTIONS.has(name)) isCreate = true;
      if (BUY_INSTRUCTIONS.has(name))    isBuy = true;
      if (SELL_INSTRUCTIONS.has(name))    isSell = true;
    }
  }

  return { isCreate, isBuy, isSell, instructionName };
}

export function extractTradeEventsFromLogs(logs) {
  const events = [];
  for (const line of logs) {
    const m = line.match(/^Program data: (.+)$/);
    if (m) {
      const parsed = parseTradeEvent(m[1]);
      if (parsed) events.push(parsed);
    }
  }
  return events;
}

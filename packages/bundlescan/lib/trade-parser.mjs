// trade-parser.mjs — extract normalised trade events from a decoded tx.
// Supports pump.fun V3 trade events and infers direction from log messages.
// A "trade" is: { program, mint, user, solAmount, tokenAmount,
//                 virtualSolReserves, virtualTokenReserves, direction }
import bs58 from 'bs58';
import {
  PROGRAMS,
  PUMPFUN_TRADE_EVENT_PREFIX,
  PUMPFUN_TRADE_EVENT_LAYOUT as L,
  BUY_LOG_NAMES,
  SELL_LOG_NAMES,
} from './constants.mjs';

function u64le(buf, start) {
  return buf.readBigUInt64LE(start);
}

function sliceB58(buf, [a, b]) {
  return bs58.encode(buf.subarray(a, b));
}

// Collect candidate event payloads: anchor self-CPI inner-instruction data,
// plus base64 "Program data:" log lines.
function candidatePayloads(decoded) {
  const out = [];
  for (const ix of decoded.innerInstructions) {
    if (ix.programId === PROGRAMS.PUMPFUN && ix.data?.length) out.push(ix.data);
  }
  for (const line of decoded.logMessages) {
    const m = /^Program data: (.+)$/.exec(line);
    if (m) {
      try {
        out.push(Buffer.from(m[1], 'base64'));
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

// Direction from Anchor instruction logs: "Program log: Instruction: Buy".
function directionFromLogs(logMessages) {
  for (const line of logMessages) {
    const m = /Instruction:\s*(\w+)/.exec(line);
    if (!m) continue;
    const name = m[1];
    if (BUY_LOG_NAMES.includes(name)) return 'buy';
    if (SELL_LOG_NAMES.includes(name)) return 'sell';
  }
  return null;
}

function parsePumpfunEvent(buf) {
  if (buf.length < L.virtualTokenReserves[1]) return null;
  const disc = buf.subarray(0, 8).toString('hex');
  if (disc !== PUMPFUN_TRADE_EVENT_PREFIX) return null;
  return {
    program: 'pumpfun',
    mint: sliceB58(buf, L.mint),
    solAmount: u64le(buf, L.solAmount[0]),
    tokenAmount: u64le(buf, L.tokenAmount[0]),
    user: sliceB58(buf, L.user),
    virtualSolReserves: u64le(buf, L.virtualSolReserves[0]),
    virtualTokenReserves: u64le(buf, L.virtualTokenReserves[0]),
  };
}

/**
 * Return all trade events detected in a decoded transaction.
 * Direction is taken from the transaction's instruction logs; for the
 * sandwich detector we additionally fall back to SOL-flow sign per trade.
 */
export function parseTrades(decoded) {
  const trades = [];
  const logDir = directionFromLogs(decoded.logMessages);

  for (const buf of candidatePayloads(decoded)) {
    const ev = parsePumpfunEvent(buf);
    if (!ev) continue;

    // Direction: prefer explicit log; otherwise infer from the signer's net SOL.
    let direction = logDir;
    if (!direction) {
      const signerDelta = decoded.balanceChanges.find(
        (c) => c.account === decoded.signer
      )?.lamports;
      // Spending SOL (minus fee) on the curve => buy; receiving => sell.
      if (signerDelta != null) direction = signerDelta < 0n ? 'buy' : 'sell';
    }

    trades.push({
      ...ev,
      direction,
      signer: decoded.signer,
      signature: decoded.signature,
    });
  }
  return trades;
}

export default { parseTrades };

import { Connection, PublicKey } from '@solana/web3.js';
import { LAMPORTS_PER_SOL } from './constants.js';

const BONDING_CURVE_SIZE = 312;

export async function fetchBondingCurveState(connection, bondingCurvePda) {
  const info = await connection.getAccountInfo(bondingCurvePda);
  if (!info || info.data.length < BONDING_CURVE_SIZE) return null;

  const data = info.data;
  const virtualTokenReserves = data.readBigUInt64LE(8);
  const virtualSolReserves   = data.readBigUInt64LE(16);
  const realTokenReserves    = data.readBigUInt64LE(24);
  const realSolReserves      = data.readBigUInt64LE(32);
  const tokenTotalSupply     = data.readBigUInt64LE(40);
  const complete             = data[48] === 1;

  return {
    virtualTokenReserves: Number(virtualTokenReserves),
    virtualSolReserves:   Number(virtualSolReserves),
    realTokenReserves:    Number(realTokenReserves),
    realSolReserves:      Number(realSolReserves),
    tokenTotalSupply:     Number(tokenTotalSupply),
    complete,
    price: Number(virtualSolReserves) / Number(virtualTokenReserves),
  };
}

export function calculateTokensOut(solAmountLamports, virtualSolReserves, virtualTokenReserves) {
  const solIn = BigInt(solAmountLamports);
  const vSol  = BigInt(virtualSolReserves);
  const vTok  = BigInt(virtualTokenReserves);
  return Number((solIn * vTok) / (vSol + solIn));
}

export function calculateSolOut(tokenAmount, virtualSolReserves, virtualTokenReserves) {
  const tokIn = BigInt(tokenAmount);
  const vSol  = BigInt(virtualSolReserves);
  const vTok  = BigInt(virtualTokenReserves);
  return Number((tokIn * vSol) / (vTok + tokIn));
}

import {
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  PublicKey,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import {
  PUMP_PROGRAM,
  PUMP_GLOBAL,
  PUMP_FEE_RECIPIENT,
  PUMP_EVENT_AUTHORITY,
  PUMP_FEE_CONFIG,
  TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  RENT_PROGRAM,
  JITO_TIP_ACCOUNTS,
} from './constants.js';
import { deriveBondingCurve, deriveAssociatedTokenAddress } from './pda.js';
import { calculateTokensOut, calculateSolOut } from './bonding.js';

// V3 discriminators — sha256("global:<snake_case>")[0..8]
const BUY_V3_DISCRIMINATOR  = Buffer.from('07051dc4f5176550', 'hex');
const SELL_V3_DISCRIMINATOR = Buffer.from('1c92de7726c469d5', 'hex');

function randomTipAccount() {
  const idx = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return new PublicKey(JITO_TIP_ACCOUNTS[idx]);
}

function buildVersionedTx(payer, instructions, recentBlockhash) {
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  return tx;
}

export function buildBuyTransaction({
  payer,
  mint,
  solAmountLamports,
  virtualSolReserves,
  virtualTokenReserves,
  slippageBps = 500,
  recentBlockhash,
  jitoTipLamports,
}) {
  const mintKey = typeof mint === 'string' ? new PublicKey(mint) : mint;
  const bondingCurve = deriveBondingCurve(mintKey);
  const bondingCurveAta = deriveAssociatedTokenAddress(bondingCurve, mintKey);
  const payerAta = deriveAssociatedTokenAddress(payer.publicKey, mintKey);

  const tokensOut = calculateTokensOut(solAmountLamports, virtualSolReserves, virtualTokenReserves);
  const minTokens = Math.floor(tokensOut * (1 - slippageBps / 10000));

  const data = Buffer.alloc(8 + 8 + 8);
  BUY_V3_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(BigInt(minTokens), 8);
  data.writeBigUInt64LE(BigInt(solAmountLamports), 16);

  const buyIx = new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [
      { pubkey: PUMP_GLOBAL,            isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_RECIPIENT,     isSigner: false, isWritable: true  },
      { pubkey: mintKey,                isSigner: false, isWritable: false },
      { pubkey: bondingCurve,           isSigner: false, isWritable: true  },
      { pubkey: bondingCurveAta,        isSigner: false, isWritable: true  },
      { pubkey: payerAta,               isSigner: false, isWritable: true  },
      { pubkey: payer.publicKey,        isSigner: true,  isWritable: true  },
      { pubkey: SYSTEM_PROGRAM,         isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM,          isSigner: false, isWritable: false },
      { pubkey: RENT_PROGRAM,           isSigner: false, isWritable: false },
      { pubkey: PUMP_EVENT_AUTHORITY,    isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM,           isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_CONFIG,        isSigner: false, isWritable: false },
    ],
    data,
  });

  return buildVersionedTx(payer, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, mintKey,
    ),
    buyIx,
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: randomTipAccount(),
      lamports: jitoTipLamports,
    }),
  ], recentBlockhash);
}

export function buildSellTransaction({
  payer,
  mint,
  tokenAmount,
  virtualSolReserves,
  virtualTokenReserves,
  slippageBps = 500,
  recentBlockhash,
  jitoTipLamports,
}) {
  const mintKey = typeof mint === 'string' ? new PublicKey(mint) : mint;
  const bondingCurve = deriveBondingCurve(mintKey);
  const bondingCurveAta = deriveAssociatedTokenAddress(bondingCurve, mintKey);
  const payerAta = deriveAssociatedTokenAddress(payer.publicKey, mintKey);

  const solOut = calculateSolOut(tokenAmount, virtualSolReserves, virtualTokenReserves);
  const minSol = Math.floor(solOut * (1 - slippageBps / 10000));

  const data = Buffer.alloc(8 + 8 + 8);
  SELL_V3_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(BigInt(tokenAmount), 8);
  data.writeBigUInt64LE(BigInt(minSol), 16);

  const sellIx = new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [
      { pubkey: PUMP_GLOBAL,            isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_RECIPIENT,     isSigner: false, isWritable: true  },
      { pubkey: mintKey,                isSigner: false, isWritable: false },
      { pubkey: bondingCurve,           isSigner: false, isWritable: true  },
      { pubkey: bondingCurveAta,        isSigner: false, isWritable: true  },
      { pubkey: payerAta,               isSigner: false, isWritable: true  },
      { pubkey: payer.publicKey,        isSigner: true,  isWritable: true  },
      { pubkey: SYSTEM_PROGRAM,         isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM,          isSigner: false, isWritable: false },
      { pubkey: RENT_PROGRAM,           isSigner: false, isWritable: false },
      { pubkey: PUMP_EVENT_AUTHORITY,    isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM,           isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_CONFIG,        isSigner: false, isWritable: false },
    ],
    data,
  });

  return buildVersionedTx(payer, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    sellIx,
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: randomTipAccount(),
      lamports: jitoTipLamports,
    }),
  ], recentBlockhash);
}

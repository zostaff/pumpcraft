import {
  ComputeBudgetProgram,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { CU_LIMIT, CU_PRICE, TIP_SOL } from "./config.mjs";
import { JITO_TIP_ACCOUNTS } from "./constants.mjs";
import { connection } from "./rpc.mjs";

export function computeBudgetIxs(cuPrice = CU_PRICE, cuLimit = CU_LIMIT) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
  ];
}

export function jitoTipIx(payer, tipSol = TIP_SOL) {
  const tipAccount = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: tipAccount,
    lamports: Math.floor(tipSol * 1e9),
  });
}

export async function buildVersionedTx(payer, instructions, addressLookupTables = []) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(addressLookupTables);
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  return tx;
}

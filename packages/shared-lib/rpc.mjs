import { Connection } from "@solana/web3.js";
import { RPC_URL, WS_URL } from "./config.mjs";

export const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  wsEndpoint: WS_URL,
});

export async function sendTxWithRetry(tx, opts = {}) {
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: opts.skipPreflight ?? false,
    maxRetries: opts.maxRetries ?? 3,
    preflightCommitment: "confirmed",
  });
  console.log(`tx sent: ${sig}`);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const result = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) {
    throw new Error(`tx failed: ${JSON.stringify(result.value.err)}`);
  }
  console.log(`tx confirmed: ${sig}`);
  return sig;
}

export async function getSOLBalance(pubkey) {
  return (await connection.getBalance(pubkey)) / 1e9;
}

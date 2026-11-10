import { PublicKey } from '@solana/web3.js';
import { PUMP_PROGRAM, ASSOCIATED_TOKEN_PROGRAM, TOKEN_PROGRAM } from './constants.js';

export function deriveBondingCurve(mint) {
  const mintKey = typeof mint === 'string' ? new PublicKey(mint) : mint;
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mintKey.toBuffer()],
    PUMP_PROGRAM,
  );
  return pda;
}

export function deriveAssociatedTokenAddress(owner, mint) {
  const ownerKey = typeof owner === 'string' ? new PublicKey(owner) : owner;
  const mintKey  = typeof mint  === 'string' ? new PublicKey(mint)  : mint;
  const [ata] = PublicKey.findProgramAddressSync(
    [ownerKey.toBuffer(), TOKEN_PROGRAM.toBuffer(), mintKey.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM,
  );
  return ata;
}

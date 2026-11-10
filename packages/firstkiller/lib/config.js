import 'dotenv/config';

export const config = {
  rpcWss:          process.env.RPC_WSS || '',
  rpcUrl:          process.env.RPC_URL || '',
  heliusApiKey:    process.env.HELIUS_API_KEY || '',
  walletKey:       process.env.WALLET_PRIVATE_KEY || '',

  buySol:          parseFloat(process.env.BACKRUN_BUY_SOL || '0.1'),
  jitoTip:         parseFloat(process.env.BACKRUN_JITO_TIP || '0.001'),
  takeProfit:      parseFloat(process.env.BACKRUN_TAKE_PROFIT || '2.0'),
  stopLoss:        parseFloat(process.env.BACKRUN_STOP_LOSS || '0.5'),
  timeoutSec:      parseInt(process.env.BACKRUN_TIMEOUT_SEC || '60', 10),
  minDevBuy:       parseFloat(process.env.BACKRUN_MIN_DEV_BUY || '0.5'),
  maxPositions:    parseInt(process.env.BACKRUN_MAX_POSITIONS || '3', 10),
  cooldownSec:     parseInt(process.env.BACKRUN_COOLDOWN_SEC || '5', 10),

  jitoBlockEngine: process.env.JITO_BLOCK_ENGINE || 'https://mainnet.block-engine.jito.wtf',
};

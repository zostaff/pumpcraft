#!/usr/bin/env node
// wallet-guard.mjs — watch a wallet for inbound sandwich attacks.
// Alerts when the given wallet appears as a sandwich *victim*, and recommends
// tightening slippage so future trades would be rejected before the attack.
//
//   node bot/wallet-guard.mjs <wallet_address>
import { config } from '../lib/config.mjs';
import { BlockListener } from '../lib/listener.mjs';
import { analyzeBlock } from '../lib/bundle-detector.mjs';
import { detectSandwiches } from '../lib/sandwich-detector.mjs';
import { color, loss, tip as tipColor, log, box } from '../lib/logger.mjs';
import { append } from '../lib/store.mjs';

const wallet = process.argv[2] || config.guardWallet;
if (!wallet) {
  console.error('usage: node bot/wallet-guard.mjs <wallet_address>');
  console.error('   or set GUARD_WALLET in .env');
  process.exit(1);
}

const threshold = config.guardAlertThreshold;
const short = (s) => (s ? s.slice(0, 4) + '…' + s.slice(-4) : '?');
const session = { started: Date.now(), blocks: 0, hits: 0, totalLoss: 0 };

function alert(s) {
  session.hits++;
  session.totalLoss += s.lossSol;
  const lines = [
    `${color.bold('⚠ YOUR WALLET WAS SANDWICHED')}`,
    `${color.bold('Attacker:')} ${short(s.attacker)}`,
    `${color.bold('Token:   ')} ${short(s.mint)}`,
    `${color.bold('Slot:    ')} ${s.slot}`,
    `${color.bold('Loss:    ')} ${loss('-' + s.lossSol.toFixed(4) + ' SOL')}`,
    `${color.bold('Attacker tip:')} ${tipColor(s.tipSol.toFixed(4) + ' SOL')}`,
    '',
    color.yellow('Recommendation: lower your slippage tolerance so a'),
    color.yellow('front-run that moves price this much rejects your trade.'),
  ];
  console.log('\n' + box('SANDWICH ALERT', lines, color.red));
  append({ ...s, guardWallet: wallet, profitLamports: s.profitLamports, lostTokens: s.lostTokens, tipLamports: s.tipLamports, alert: true });
}

function onBlock({ slot, block }) {
  session.blocks++;
  const { decoded } = analyzeBlock(block, slot);
  const sandwiches = detectSandwiches(decoded, { minProfitSol: 0 });
  for (const s of sandwiches) {
    if (s.victim === wallet && s.lossSol >= threshold) alert(s);
  }
}

const listener = new BlockListener();
listener.on('block', onBlock);
listener.on('error', (err) => log.error(String(err?.message || err)));

log.info(color.bold('wallet-guard'), color.gray(`watching ${short(wallet)}`), color.gray(`threshold=${threshold} SOL`));
listener.start();

function shutdown() {
  listener.stop();
  const mins = ((Date.now() - session.started) / 60000).toFixed(1);
  const lines = [
    `${color.bold('Watched:')}  ${short(wallet)}`,
    `${color.bold('Duration:')} ${mins} min`,
    `${color.bold('Blocks:  ')} ${session.blocks}`,
    `${color.bold('Attacks: ')} ${session.hits}`,
    `${color.bold('Total loss:')} ${loss('-' + session.totalLoss.toFixed(4) + ' SOL')}`,
  ];
  console.log('\n' + box('GUARD SESSION', lines, color.magenta));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

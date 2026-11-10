#!/usr/bin/env node
// stats.mjs — aggregated MEV statistics over a time window, from recorded data.
//
//   node bot/stats.mjs [--hours 24] [--top 20]
import { readSince } from '../lib/store.mjs';
import { color, profit, loss, box } from '../lib/logger.mjs';

function parseArgs(argv) {
  const a = { hours: 24, top: 20 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--hours') a.hours = Number(argv[++i]);
    else if (argv[i] === '--top') a.top = Number(argv[++i]);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const short = (s) => (s ? s.slice(0, 4) + '…' + s.slice(-4) : '?');

const rows = readSince(args.hours);
const sandwiches = rows.filter((r) => r.type === 'sandwich');
const arbs = rows.filter((r) => r.type === 'arb');

if (rows.length === 0) {
  console.log(color.gray(`No recorded MEV in the last ${args.hours}h. Run the scanner first:`));
  console.log(color.gray('  node bot/scanner.mjs'));
  process.exit(0);
}

const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const totalProfit = sum(sandwiches, (r) => r.profitSol) + sum(arbs, (r) => r.profitSol);
const totalLoss = sum(sandwiches, (r) => r.lossSol);
const avgProfit = sandwiches.length ? sum(sandwiches, (r) => r.profitSol) / sandwiches.length : 0;
const fattest = sandwiches.slice().sort((a, b) => b.profitSol - a.profitSol)[0];

function topBy(arr, keyFn) {
  const m = new Map();
  for (const r of arr) {
    const k = keyFn(r);
    if (!k) continue;
    const e = m.get(k) ?? { count: 0, profit: 0 };
    e.count++;
    e.profit += r.profitSol || 0;
    m.set(k, e);
  }
  return [...m.entries()].sort((a, b) => b[1].profit - a[1].profit).slice(0, args.top);
}

const summary = [
  `${color.bold('Window:    ')} last ${args.hours}h`,
  `${color.bold('Sandwiches:')} ${sandwiches.length}`,
  `${color.bold('Arbs:      ')} ${arbs.length}`,
  `${color.bold('Extracted: ')} ${profit('+' + totalProfit.toFixed(4) + ' SOL')}`,
  `${color.bold('Victim loss:')} ${loss('-' + totalLoss.toFixed(4) + ' SOL')}`,
  `${color.bold('Avg profit:')} ${profit(avgProfit.toFixed(4) + ' SOL')}`,
  fattest
    ? `${color.bold('Fattest:   ')} ${profit('+' + fattest.profitSol.toFixed(4) + ' SOL')} (${short(fattest.attacker)} on ${short(fattest.mint)})`
    : '',
].filter(Boolean);

console.log(box('MEV STATS', summary, color.magenta));

console.log('\n' + color.bold('Top attackers:'));
for (const [addr, e] of topBy(sandwiches, (r) => r.attacker)) {
  console.log(`  ${short(addr)}  ${color.gray(e.count + 'x')}  ${profit('+' + e.profit.toFixed(4) + ' SOL')}`);
}

console.log('\n' + color.bold('Top tokens:'));
for (const [mint, e] of topBy(sandwiches, (r) => r.mint)) {
  console.log(`  ${short(mint)}  ${color.gray(e.count + 'x')}  ${profit('+' + e.profit.toFixed(4) + ' SOL')}`);
}

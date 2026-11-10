const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function fmt(color, tag, ...args) {
  console.log(`${COLORS.gray}${ts()}${COLORS.reset} ${color}${COLORS.bold}[${tag}]${COLORS.reset}`, ...args);
}

export const log = {
  buy: (...args) => fmt(COLORS.green, 'BUY', ...args),
  sell: (...args) => fmt(COLORS.red, 'SELL', ...args),
  fund: (...args) => fmt(COLORS.yellow, 'FUND', ...args),
  drain: (...args) => fmt(COLORS.blue, 'DRAIN', ...args),
  info: (...args) => fmt(COLORS.cyan, 'INFO', ...args),
  warn: (...args) => fmt(COLORS.magenta, 'WARN', ...args),
  error: (...args) => fmt(COLORS.red, 'ERROR', ...args),
  paper: (...args) => fmt(COLORS.gray, 'PAPER', ...args),
  job: (...args) => fmt(COLORS.white, 'JOB', ...args),
};

export function shortKey(pubkey) {
  const s = typeof pubkey === 'string' ? pubkey : pubkey.toBase58();
  return s.slice(0, 4) + '..' + s.slice(-4);
}

export function solStr(lamports) {
  return (Number(lamports) / 1e9).toFixed(4);
}

const C = {
  reset:   '\x1b[0m',
  dim:     '\x1b[90m',
  red:     '\x1b[31;1m',
  green:   '\x1b[32;1m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34;1m',
  magenta: '\x1b[35;1m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37;1m',
};

function ts() {
  const d = new Date();
  return `${C.dim}${d.toLocaleTimeString('en-GB')}${C.reset}`;
}

export function info(msg)  { console.log(`${ts()} ${C.cyan}INFO${C.reset}  ${msg}`); }
export function ok(msg)    { console.log(`${ts()} ${C.green}OK${C.reset}    ${msg}`); }
export function warn(msg)  { console.log(`${ts()} ${C.yellow}WARN${C.reset}  ${msg}`); }
export function error(msg) { console.log(`${ts()} ${C.red}ERROR${C.reset} ${msg}`); }
export function dim(msg)   { console.log(`${ts()} ${C.dim}${msg}${C.reset}`); }

export function scoreColor(score) {
  if (score >= 70) return C.red;
  if (score >= 40) return C.yellow;
  return C.green;
}

export function bar(score, width = 12) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function box(lines, title = '') {
  const maxLen = Math.max(title.length + 4, ...lines.map(l => stripAnsi(l).length));
  const w = maxLen + 2;
  const top = title
    ? `┌─ ${title} ${'─'.repeat(Math.max(0, w - title.length - 4))}┐`
    : `┌${'─'.repeat(w)}┐`;
  const bot = `└${'─'.repeat(w)}┘`;
  const rows = lines.map(l => {
    const pad = w - stripAnsi(l).length;
    return `│ ${l}${' '.repeat(Math.max(0, pad - 1))}│`;
  });
  return [top, ...rows, bot].join('\n');
}

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

export { C };

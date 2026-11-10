// logger.mjs — small ANSI colour helper. No dependencies.

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? code + s + C.reset : String(s));

export const color = {
  dim: wrap(C.dim),
  bold: wrap(C.bold),
  red: wrap(C.red),
  green: wrap(C.green),
  yellow: wrap(C.yellow),
  blue: wrap(C.blue),
  magenta: wrap(C.magenta),
  cyan: wrap(C.cyan),
  gray: wrap(C.gray),
};

// Convention from the guide: profit green, loss red, tip yellow.
export const profit = (s) => color.green(s);
export const loss = (s) => color.red(s);
export const tip = (s) => color.yellow(s);

export function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

export const log = {
  info: (...a) => console.log(color.gray(ts()), ...a),
  warn: (...a) => console.warn(color.yellow(ts()), color.yellow('WARN'), ...a),
  error: (...a) => console.error(color.red(ts()), color.red('ERR '), ...a),
  plain: (...a) => console.log(...a),
};

// Draw a boxed panel from an array of lines. Pads to the widest line.
export function box(title, lines, boxColor = color.cyan) {
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const width = Math.max(
    stripAnsi(title).length + 2,
    ...lines.map((l) => stripAnsi(l).length)
  );
  const pad = (s) => s + ' '.repeat(Math.max(0, width - stripAnsi(s).length));
  const top = boxColor('┌─ ' + title + ' ' + '─'.repeat(Math.max(0, width - title.length - 1)) + '┐');
  const bottom = boxColor('└' + '─'.repeat(width + 2) + '┘');
  const body = lines.map((l) => boxColor('│ ') + pad(l) + boxColor(' │'));
  return [top, ...body, bottom].join('\n');
}

export default { color, profit, loss, tip, log, box, ts };

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE   = '\x1b[34m';
const MAGENTA= '\x1b[35m';
const CYAN   = '\x1b[36m';
const WHITE  = '\x1b[37m';
const GRAY   = '\x1b[90m';

const BG_RED   = '\x1b[41m';
const BG_GREEN = '\x1b[42m';
const BG_BLUE  = '\x1b[44m';
const BG_MAGENTA = '\x1b[45m';

function ts() {
  return GRAY + new Date().toISOString().slice(11, 23) + RESET;
}

export const log = {
  banner() {
    console.log(`
${RED}${BOLD}  ┌─────────────────────────────────────────┐${RESET}
${RED}${BOLD}  │${RESET}  ${WHITE}${BOLD}⚡ F I R S T B L O O D${RESET}                   ${RED}${BOLD}│${RESET}
${RED}${BOLD}  │${RESET}  ${DIM}Jito Bundle Backrunner · pump.fun V3${RESET}   ${RED}${BOLD}│${RESET}
${RED}${BOLD}  └─────────────────────────────────────────┘${RESET}
`);
  },

  info(msg)    { console.log(`${ts()} ${BLUE}ℹ${RESET}  ${msg}`); },
  success(msg) { console.log(`${ts()} ${GREEN}✓${RESET}  ${msg}`); },
  warn(msg)    { console.log(`${ts()} ${YELLOW}⚠${RESET}  ${YELLOW}${msg}${RESET}`); },
  error(msg)   { console.log(`${ts()} ${RED}✗${RESET}  ${RED}${msg}${RESET}`); },
  debug(msg)   { console.log(`${ts()} ${GRAY}·${RESET}  ${DIM}${msg}${RESET}`); },

  create(mint) {
    console.log(`${ts()} ${BG_MAGENTA}${WHITE}${BOLD} NEW TOKEN ${RESET} ${CYAN}${mint}${RESET}`);
  },

  devBuy(sol) {
    console.log(`${ts()} ${MAGENTA}💰${RESET} Dev buy: ${BOLD}${sol.toFixed(4)} SOL${RESET}`);
  },

  buy(mint, sol, tip) {
    console.log(`${ts()} ${BG_GREEN}${WHITE}${BOLD} BUY ${RESET} ${GREEN}${sol} SOL${RESET} → ${CYAN}${mint.slice(0, 8)}...${RESET}  tip: ${YELLOW}${tip} SOL${RESET}`);
  },

  sell(mint, pnl) {
    const color = pnl >= 0 ? GREEN : RED;
    const emoji = pnl >= 0 ? '📈' : '📉';
    console.log(`${ts()} ${BG_RED}${WHITE}${BOLD} SELL ${RESET} ${emoji} ${CYAN}${mint.slice(0, 8)}...${RESET}  PnL: ${color}${BOLD}${pnl >= 0 ? '+' : ''}${(pnl * 100).toFixed(1)}%${RESET}`);
  },

  bundle(id) {
    console.log(`${ts()} ${BG_BLUE}${WHITE}${BOLD} JITO ${RESET} Bundle sent: ${YELLOW}${id}${RESET}`);
  },

  position(mint, price, entry, elapsed) {
    const pnl = (price - entry) / entry;
    const color = pnl >= 0 ? GREEN : RED;
    console.log(`${ts()} ${GRAY}📊${RESET} ${CYAN}${mint.slice(0, 8)}...${RESET}  price: ${BOLD}${price.toFixed(10)}${RESET}  PnL: ${color}${(pnl * 100).toFixed(1)}%${RESET}  ${DIM}${elapsed}s${RESET}`);
  },

  dryRun() {
    console.log(`${ts()} ${BG_MAGENTA}${WHITE}${BOLD} DRY RUN ${RESET} ${YELLOW}Transactions will NOT be sent${RESET}`);
  },

  stats(positions, buys, sells, profit) {
    console.log(`\n${GRAY}─────────────────────────────────${RESET}`);
    console.log(`  ${BOLD}Positions:${RESET} ${positions}  ${BOLD}Buys:${RESET} ${buys}  ${BOLD}Sells:${RESET} ${sells}`);
    console.log(`  ${BOLD}Total PnL:${RESET} ${profit >= 0 ? GREEN : RED}${profit >= 0 ? '+' : ''}${profit.toFixed(4)} SOL${RESET}`);
    console.log(`${GRAY}─────────────────────────────────${RESET}\n`);
  },

  filter(reason, mint) {
    console.log(`${ts()} ${GRAY}⊘${RESET}  ${DIM}Filtered ${mint ? mint.slice(0, 8) + '...' : ''}: ${reason}${RESET}`);
  },
};

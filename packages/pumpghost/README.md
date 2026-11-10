# pumpghost

Detect fake activity on pump.fun tokens — bump bots, maker bots, volume bots, bundled launches.

Read-only analysis tool. Scans on-chain data and scores how "organic" a token's activity is (0-100).

## Install

```bash
npm install
cp .env.example .env
# add your RPC_URL (Helius recommended)
```

## CLI

```bash
# full scan — all 4 detection modules
node cli/scan.mjs <MINT_ADDRESS>

# holder analysis only
node cli/holders.mjs <MINT_ADDRESS>

# live monitoring via WebSocket
node cli/watch.mjs <MINT_ADDRESS>
```

## Dashboard

```bash
node dashboard/server.mjs
# open http://localhost:3003
```

## Detection Modules

| Module | What it detects | Signals |
|--------|----------------|---------|
| **Bump** | Micro-buy bots keeping token trending | Regular intervals, fresh wallets, small amounts, shared funding |
| **Maker** | Dust holders inflating holder count | Dust balances, rent-only SOL, zero activity wallets, batch creation |
| **Volume** | Self-trading to fake volume | Buy-sell round trips, quick flips, equal amounts, zero net position |
| **Bundle** | Bundled launch buys | Same-slot buys, Jito tips, shared funding source |

Each module scores 0-100. The overall **organic score** = 100 minus the weighted average of all modules.

## How it works

1. Fetches token transactions from the bonding curve PDA
2. Fetches token holders and their wallet metadata
3. Traces funding sources to find wallet clusters
4. Runs 4 independent detection algorithms
5. Combines signals into an organic score with risk level

## Scoring

- **80-100** `LIKELY ORGANIC` — normal trading patterns
- **50-79** `SUSPICIOUS` — some manipulation signals
- **0-49** `LIKELY MANIPULATED` — strong bot activity detected

## Architecture

```
pumpghost/
├── lib/
│   ├── config.mjs            # .env loading
│   ├── constants.mjs         # program IDs, detection thresholds
│   ├── logger.mjs            # colored ANSI output, box/bar
│   ├── rpc.mjs               # rate-limited RPC + cache
│   ├── token-analyzer.mjs    # holders, transactions, wallet age
│   ├── funding-tracker.mjs   # trace funding sources, cluster wallets
│   ├── bump-detector.mjs     # micro-buy pattern detection
│   ├── maker-detector.mjs    # dust holder detection
│   ├── volume-detector.mjs   # self-trading detection
│   ├── bundle-detector.mjs   # same-slot bundled buys
│   └── scorer.mjs            # combine all signals → organic score
├── cli/
│   ├── scan.mjs              # full token analysis
│   ├── holders.mjs           # holder analysis only
│   └── watch.mjs             # live monitoring via WebSocket
└── dashboard/
    ├── server.mjs            # HTTP API + static files
    └── public/index.html     # dark theme web dashboard
```

## Config

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_URL` | mainnet | Solana RPC endpoint |
| `HELIUS_API_KEY` | — | Optional Helius API key |
| `SCAN_TX_LIMIT` | 500 | Max transactions to analyze |
| `SCAN_HOLDER_LIMIT` | 1000 | Max holders to analyze |
| `FUNDING_TRACE_DEPTH` | 2 | How deep to trace funding sources |
| `DASHBOARD_PORT` | 3003 | Dashboard HTTP port |

## Stack

Node.js 22+ · ESM · `@solana/web3.js` · `@solana/spl-token` · `bs58` · `dotenv`

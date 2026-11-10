<!-- BANNER IMAGE HERE -->

# pumpcraft

**13 open-source bots that reverse-engineer, trade, analyze, and x-ray pump.fun.**

Built from analyzing 666 on-chain wallets, decoding V3 migration, and surviving 6.85M sandwich attacks. Each tool is a standalone package with its own README, CLI, and dashboard.

```
pumpcraft/
├── packages/
│   ├── basic-trader       #1  — Buy / sell / check price on pump.fun
│   ├── monitor            #2  — Real-time stream of all pump.fun events
│   ├── sniper             #3  — Auto-buy new tokens by filters (dev buy, TP/SL)
│   ├── copy-trader        #4  — Mirror trades of tracked wallets
│   ├── analytics          #5  — Live dashboard with pump.fun metrics
│   ├── volume-analyzer    #6  — Analyze wallets & tokens, detect strategies
│   ├── graduation-sniper  #7  — Catch tokens before PumpSwap AMM migration
│   ├── curvegap           #8  — Arbitrage between bonding curve and PumpSwap
│   ├── mev-streamer       #9  — OCR + Whisper stream sniper (Python + Rust)
│   ├── pumpnuke           #10 — Volume bot with buy/sell cycles
│   ├── bundlescan         #11 — MEV bundle analyzer & sandwich detector
│   ├── pumpghost          #12 — Bump bot + holder maker (stealth presence)
│   └── shared-lib/        — Shared modules: config, RPC, wallet, constants
└── ARTICLE.md             — The full article
```

## Quick Overview

### Part 1: Foundation (7 bots)

| # | Bot | What it does | Lines |
|---|-----|-------------|-------|
| 1 | **basic-trader** | Simplest pump.fun interaction — buy, sell, price, balance | 148 |
| 2 | **monitor** | Real-time WebSocket stream of all pump.fun events | 135 |
| 3 | **sniper** | Auto-buy new tokens by configurable filters | 295 |
| 4 | **copy-trader** | Mirror trades of any wallet in real-time | 239 |
| 5 | **analytics** | Live dashboard on localhost:3000 | 333 |
| 6 | **volume-analyzer** | CLI to analyze wallets, detect trading strategies | 369 |
| 7 | **graduation-sniper** | Catch tokens right before PumpSwap migration | 301 |

### Part 2: Advanced (6 bots)

| # | Bot | What it does | Lines |
|---|-----|-------------|-------|
| 8 | **curvegap** | Arbitrage between bonding curve ↔ PumpSwap AMM | 2,490 |
| 9 | **mev-streamer** | Stream sniper: OCR + Whisper + Rust executor | 8,400+ |
| 10 | **pumpnuke** | Volume bot — wallet pool, buy/sell cycles, paper mode | 1,811 |
| 11 | **bundlescan** | MEV bundle analyzer, sandwich detection, victim calc | 1,939 |
| 12 | **pumpghost** | Bump bot (micro-buys for trending) + holder maker | 976 |

## Getting Started

Each package is independent. Pick one and go:

```bash
git clone https://github.com/zostaff/pumpcraft.git
cd pumpcraft

# Example: run the sniper
cd packages/sniper
npm install
cp .env.example .env  # add your RPC_URL
node sniper.mjs

# Example: run pumpnuke in paper mode
cd packages/pumpnuke
npm install
node cli/nuke.mjs --mint <CA> --budget 0.1 --wallets 4

# Example: scan for MEV
cd packages/bundlescan
npm install
node bot/scanner.mjs
```

## Research

These bots came from analyzing:
- **666 wallets** on pump.fun — classified into 7 strategies
- **V3 migration** — decoded new program, trade event format, BondingCurveV3
- **6.85M sandwich attacks** in 12 months ($29.7M extracted)
- **PumpSwap AMM** — the new DEX that overtook Raydium ($7.64B/month)
- **Jito MEV** — BAM Direct Bundle Ingest, 34% stake preconfirmations
- **Holder Rewards** — replaced Cashback (Sept 2026), fees to holders with >$20

## Stack

- **Node.js 22+** — ESM, zero frameworks
- **Python 3.11+** — mev-streamer ingestion, vision, audio
- **Rust** — mev-streamer executor (3,756 lines)
- **@pump-fun/pump-sdk** — official pump.fun SDK
- **@solana/web3.js** — Solana interaction
- **Jito** — bundle submission, tip accounts

## What This Is NOT

This repo does not contain:
- Private alpha (hop wallets, stealth strategies, wallet encryption, dynamic fees)
- Production trading systems
- Guaranteed profit strategies
- Financial advice

These are research tools. They show how pump.fun bots work from the inside — how to build them, how to detect them, and how to protect yourself from them.

## Article

The full article lives in `ARTICLE.md`:

> **I Crafted 13 Bots That Dissect pump.fun**
>
> Part 1: How I reverse-engineered V3 and built 7 trading bots
> Part 2: They patched V3. I built 6 more bots anyway.

## License

MIT

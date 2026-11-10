<p align="center"><img src="assets/hero.svg?v=2" width="100%" alt="PUMPCRAFT"></p>

<p align="center">
  <img src="https://img.shields.io/badge/node-22%2B-00d18c?style=for-the-badge&labelColor=0a1a14" alt="node">
  <img src="https://img.shields.io/badge/python-3.11%2B-00d18c?style=for-the-badge&labelColor=0a1a14" alt="python">
  <img src="https://img.shields.io/badge/rust-1.75%2B-00b376?style=for-the-badge&labelColor=0a1a14" alt="rust">
  <img src="https://img.shields.io/badge/solana-web3.js-00ff88?style=for-the-badge&labelColor=0a1a14" alt="solana">
  <img src="https://img.shields.io/badge/pump.fun-V3%20API-00e5ff?style=for-the-badge&labelColor=0a1a14" alt="pump.fun">
  <img src="https://img.shields.io/badge/bots-13-00ff88?style=for-the-badge&labelColor=0a1a14" alt="13 bots">
  <img src="https://img.shields.io/badge/license-MIT-008a5c?style=for-the-badge&labelColor=0a1a14" alt="MIT">
</p>

<p align="center">
  <b><a href="#01--quick-start">[ start ]</a></b> ·
  <b><a href="#02--the-arsenal">[ arsenal ]</a></b> ·
  <b><a href="#03--research">[ research ]</a></b> ·
  <b><a href="#04--architecture">[ architecture ]</a></b> ·
  <b><a href="#05--stack">[ stack ]</a></b> ·
  <b><a href="#06--faq">[ faq ]</a></b>
</p>

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<p align="center"><img src="assets/specs.svg?v=2" width="100%" alt="the numbers"></p>

**13 open-source bots that reverse-engineer, trade, analyze, and x-ray pump.fun.** Built from analyzing 666 on-chain wallets across 7 trading strategies, decoding pump.fun's V3 migration, and tracking 6.85M sandwich attacks over 12 months.

Each bot is a standalone package — its own `package.json`, CLI, config, and (where applicable) dashboard. Clone the monorepo or grab a single package. Zero paid dependencies.

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<a id="01--quick-start"></a>
<p align="center"><img src="assets/section-01.svg?v=2" width="100%" alt="section-01"></p>

```bash
git clone https://github.com/zostaff/pumpcraft.git
cd pumpcraft
```

Pick a package and run:

```bash
# Token monitor — stream all pump.fun events
cd packages/monitor
npm install
cp .env.example .env        # add your RPC_URL
node monitor.mjs

# Sniper — auto-buy new tokens by filters
cd packages/sniper
npm install
cp .env.example .env
node sniper.mjs

# Analytics — live dashboard
cd packages/analytics
npm install
node analytics.mjs           # http://localhost:3000

# Bundlescan — detect MEV sandwiches
cd packages/bundlescan
npm install
node bot/scanner.mjs
```

Every package expects a `.env` with at minimum:

```env
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

Some packages (sniper, copy-trader, basic-trader) also need:

```env
WALLET_PRIVATE_KEY=your_base58_private_key
```

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<a id="02--the-arsenal"></a>
<p align="center"><img src="assets/section-02.svg?v=2" width="100%" alt="section-02"></p>

<p align="center"><img src="assets/tree.svg?v=2" width="100%" alt="tree"></p>

### Part 1 — Foundation (7 bots)

Written for the article *"How I Reverse-Engineered pump.fun's V3 API and Built 7 Trading Bots"*.

| # | Package | What it does | Lines | Language |
|:-:|---------|-------------|------:|:--------:|
| 1 | **[basic-trader](packages/basic-trader)** | Buy, sell, check price, check balance on pump.fun | 148 | JS |
| 2 | **[monitor](packages/monitor)** | Real-time WebSocket stream of all pump.fun events | 135 | JS |
| 3 | **[sniper](packages/sniper)** | Auto-buy new tokens by configurable filters (dev buy size, TP/SL, timeout) | 295 | JS |
| 4 | **[copy-trader](packages/copy-trader)** | Mirror trades of tracked wallets in real-time | 239 | JS |
| 5 | **[analytics](packages/analytics)** | Live dashboard on localhost:3000 — token velocity, trade distribution, whale activity | 211 | JS |
| 6 | **[volume-analyzer](packages/volume-analyzer)** | CLI tool to analyze wallets and tokens, detect which strategy a wallet uses | 369 | JS |
| 7 | **[graduation-sniper](packages/graduation-sniper)** | Catch tokens right before they migrate to PumpSwap AMM | 301 | JS |

### Part 2 — Advanced (6 bots)

From *"They patched V3. I built 6 more bots anyway."*

| # | Package | What it does | Lines | Language |
|:-:|---------|-------------|------:|:--------:|
| 8 | **[firstkiller](packages/firstkiller)** | Same-block token entry via Jito bundle backrun | 933 | JS |
| 9 | **[curvegap](packages/curvegap)** | Arbitrage between bonding curve price and PumpSwap AMM | 2,490 | JS |
| 10 | **[mev-streamer](packages/mev-streamer)** | Stream sniper: OCR + Whisper audio + Rust executor, multi-source ingestion | 11,070 | Rust+Py |
| 11 | **[bundlescan](packages/bundlescan)** | MEV bundle analyzer — sandwich detection, victim calculation, Jito tip tracking | 1,760 | JS |
| 12 | **[pumpnuke](packages/pumpnuke)** | Volume generation with wallet pool rotation and buy/sell cycles | 1,493 | JS |
| 13 | **[pumpghost](packages/pumpghost)** | Bump and maker presence tool — micro-buys for trending, dust for holder count | 834 | JS |

### Shared Library

**[shared-lib](packages/shared-lib)** — 404 lines across 7 modules: `config.mjs`, `constants.mjs`, `pumpfun.mjs`, `rpc.mjs`, `tx.mjs`, `wallet.mjs`, `ws.mjs`. Shared by all JS packages.

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<a id="03--research"></a>
<p align="center"><img src="assets/section-03.svg?v=2" width="100%" alt="section-03"></p>

<p align="center"><img src="assets/strategies.svg?v=2" width="100%" alt="strategies"></p>

These bots came from analyzing real on-chain data:

- **666 wallets** on pump.fun — classified into 7 distinct strategies by transaction pattern
- **V3 migration** — decoded the new program, trade event format (`bddb7fd34ee661ee`), BondingCurveV3
- **6.85M sandwich attacks** tracked over 12 months — $29.7M extracted by MEV actors
- **PumpSwap AMM** — pump.fun's own DEX that overtook Raydium ($7.64B/month volume)
- **Jito MEV** — BAM Direct Bundle Ingest, 34% stake preconfirmations
- **Holder Rewards** — replaced Cashback (Sept 2026), fees distributed to holders with >$20

<p align="center"><img src="assets/flow.svg?v=2" width="100%" alt="token lifecycle"></p>

<details>
<summary><b>Strategy breakdown (text version)</b></summary>

| Strategy | Wallets | Win Rate | How It Works |
|----------|--------:|---------:|---|
| Direct HFT | 89 | 80% | Raw speed, CU priority=0, edge is token selection |
| Sell-Only | 112 | 62% | Never buy on pump.fun — tokens arrive via bundles/airdrops |
| Multi-Program | 45 | 40% | Multiple on-chain programs in a single transaction |
| Custom Bots | 203 | 35% | Own on-chain programs with CPI into pump.fun |
| Slot-0 Snipers | 67 | 10–45% | Buy in the same slot as token creation |
| Brute Force | 98 | 25% | Buy everything, sell fast, rely on volume |
| Buy-Only | 52 | 15% | Buy but never sell on pump.fun (exit elsewhere) |

</details>

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<a id="04--architecture"></a>
<p align="center"><img src="assets/section-04.svg?v=2" width="100%" alt="section-04"></p>

```
pumpcraft/
├── packages/
│   ├── basic-trader/          #1   simplest interaction
│   ├── monitor/               #2   event stream
│   ├── sniper/                #3   auto-buy
│   ├── copy-trader/           #4   wallet mirroring
│   ├── analytics/             #5   dashboard
│   ├── volume-analyzer/       #6   strategy detection
│   ├── graduation-sniper/     #7   pre-migration entry
│   ├── firstkiller/           #8   same-block Jito
│   ├── curvegap/              #9   curve↔AMM arb
│   ├── mev-streamer/          #10  OCR+Whisper+Rust
│   ├── bundlescan/            #11  sandwich detector
│   ├── pumpnuke/              #12  volume tool
│   ├── pumpghost/             #13  bump & maker
│   └── shared-lib/                 shared modules
└── assets/                         README SVG art
```

Every package follows the same pattern:

```
package-name/
├── package.json       # standalone deps
├── .env.example       # required env vars
├── *.mjs              # entry point(s)
├── lib/               # internal modules
├── cli/               # CLI commands (if applicable)
└── dashboard/         # web UI (if applicable)
```

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<a id="05--stack"></a>
<p align="center"><img src="assets/section-05.svg?v=2" width="100%" alt="section-05"></p>

| Layer | Tech | Used By |
|-------|------|---------|
| Runtime | **Node.js 22+** ESM | All JS packages |
| Runtime | **Python 3.11+** | mev-streamer ingestion |
| Runtime | **Rust 1.75+** | mev-streamer executor (3,756 lines) |
| Solana | **@solana/web3.js** ^1.98 | All packages |
| Solana | **@solana/spl-token** ^0.4 | Packages that handle token accounts |
| pump.fun | **@pump-fun/pump-sdk** | Trade building (buy/sell instructions) |
| pump.fun | **pump-swap-sdk** | PumpSwap AMM interaction |
| MEV | **Jito bundles** | firstkiller, bundlescan |
| Infra | Zero paid dependencies | Everything is MIT/Apache |

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<a id="06--faq"></a>
<p align="center"><img src="assets/section-07.svg?v=2" width="100%" alt="section-07"></p>

<details>
<summary><b>Do I need SOL to run these?</b></summary>
<br>
Only for packages that submit transactions (basic-trader, sniper, copy-trader, graduation-sniper, firstkiller, curvegap, pumpnuke, pumpghost). The analytical tools (monitor, analytics, volume-analyzer, bundlescan, mev-streamer) only read on-chain data and need no wallet.
</details>

<details>
<summary><b>Which RPC should I use?</b></summary>
<br>
Any Solana RPC with WebSocket support. Helius, QuickNode, or Triton all work. Free tiers are enough for the analytical tools. Trading bots benefit from a paid tier with higher rate limits.
</details>

<details>
<summary><b>Can I run these on mainnet?</b></summary>
<br>
Yes. These connect to Solana mainnet. Many packages have a <code>DRY_RUN=true</code> mode that logs what would happen without submitting transactions.
</details>

<details>
<summary><b>Are these profitable?</b></summary>
<br>
These are research tools that show how pump.fun bots work. Profitability depends on market conditions, timing, and execution. The 666-wallet study documents win rates ranging from 15% to 80% depending on strategy.
</details>

<details>
<summary><b>What's the difference between this and the standalone repos?</b></summary>
<br>
Some bots also exist as standalone repos (pumpnuke, firstkiller, bundlescan, pumpghost). This monorepo bundles all 13 in one place with the shared library. The standalone repos are identical copies.
</details>

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<p align="center"><img src="assets/disclaimer.svg?v=2" width="100%" alt="disclaimer"></p>

## What This Is NOT

- Private alpha (no hop wallets, no stealth strategies, no wallet encryption, no dynamic fees)
- A production trading system
- Guaranteed profit
- Financial advice

<p align="center"><img src="assets/divider.svg?v=2" width="100%"></p>

<p align="center"><img src="assets/footer.svg?v=2" width="100%" alt="built by zostaff"></p>

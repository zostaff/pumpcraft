# bundlescan

A **defensive / research** MEV bundle analyzer for Solana. It watches blocks in
real time, groups transactions into bundles, detects **sandwich attacks** and
**arbitrage**, quantifies how much value was extracted and how much victims
lost, and lets you guard a specific wallet. It ships a local dashboard and a set
of standalone library modules you can reuse.

bundlescan is built for the **protective** side of MEV: detection, monitoring,
loss quantification, and helping traders set slippage that rejects attacks.

## Scope boundary (read this)

This project **detects and analyzes** MEV. It does **not** execute it.

- There is no transaction-builder / attack engine. The guide's `lib/tx-builder.mjs`
  (which would construct and submit profitable sandwich bundles) is intentionally
  **not implemented** — that is the offensive component that extracts money from
  victims, and it's out of scope for a defensive tool.
- `lib/jito.mjs` is a **read-only** Jito client (tip accounts, tip floor, bundle
  status lookups). It cannot send bundles.
- `lib/simulator.mjs` is **pure analysis**: it estimates what a sandwich *would*
  have extracted and what slippage *would* have rejected it, so you can protect
  yourself. It builds and submits nothing.

## Install

```bash
cd bundlescan
npm install          # Node.js 22+
cp .env.example .env # then add a real RPC (Helius recommended)
```

A real RPC endpoint is strongly recommended — the public
`api.mainnet-beta.solana.com` rate-limits block fetches aggressively. Set
`HELIUS_API_KEY` (or a full `RPC_URL` / `RPC_WSS`) in `.env`.

## Usage

```bash
# Live scanner — watch MEV as it happens
node bot/scanner.mjs --min-profit 0.01 [--token <mint>]

# Wallet guard — alert if YOUR wallet gets sandwiched
node bot/wallet-guard.mjs <wallet_address>

# Stats — aggregate MEV over a window (reads recorded detections)
node bot/stats.mjs --hours 24 --top 20

# Simulator — analytical "what if this tx were sandwiched"
node bot/simulator-cli.mjs <tx_signature> --amount 0.5

# Dashboard — web UI at http://localhost:3001
node dashboard/server.mjs
# (set DASHBOARD_PORT if 3001 is taken)
```

The scanner and wallet-guard record detections to `data/detections.jsonl`;
`stats` and the dashboard read from it.

## How it works

**Bundle detection** (`lib/bundle-detector.mjs`) — transactions in one slot that
transfer lamports to a known tip account (Jito tip accounts, plus Astralane/
Nozomi by prefix), or share a signer across multiple txs, are grouped as a
bundle.

**Sandwich detection** (`lib/sandwich-detector.mjs`) — for a single mint in one
block it looks for `attacker BUY → victim BUY → attacker SELL` in block order,
same attacker on the outer two txs, a different victim in the middle, and a tip
in one of the attacker's txs. Profit is the attacker's net SOL across the front
and back txs (which already nets out fees and tip); victim loss is estimated
against the pre-attack bonding-curve reserves.

**Arbitrage detection** (`lib/arb-detector.mjs`) — heuristic: a signer that nets
positive SOL within one tx, touches 2+ DEX programs (or routes through multiple
swaps), and ends roughly flat on tokens.

**Simulation** (`lib/simulator.mjs`) — reconstructs pre-trade reserves from a
confirmed trade, sweeps front-run sizes (0.01–10 SOL) to find the profit-
maximizing sandwich, and reports attacker profit, victim loss, and the slippage
tolerance that would have rejected the trade.

All financial math is done in **BigInt lamports**.

## Modules

| Module | Purpose | Reusable |
|--------|---------|----------|
| `lib/tx-decoder.mjs` | Normalize any Solana tx (versioned-aware) | ✅ |
| `lib/trade-parser.mjs` | Extract pump.fun trade events | ✅ |
| `lib/bundle-detector.mjs` | Find bundles in a block | ✅ |
| `lib/sandwich-detector.mjs` | Detect sandwiches | ✅ |
| `lib/arb-detector.mjs` | Detect arbitrage | ✅ |
| `lib/bonding-curve.mjs` | Constant-product curve math (BigInt) | ✅ |
| `lib/profit-calc.mjs` | Attacker profit | ✅ |
| `lib/victim-calc.mjs` | Victim loss | ✅ |
| `lib/simulator.mjs` | Analytical sandwich what-if | ✅ |
| `lib/jito.mjs` | Read-only Jito client | ✅ |
| `lib/listener.mjs` | Forward block stream | ✅ |
| `lib/rpc.mjs` | Rate-limited, cached RPC | ✅ |

## Notes

- `getBlock` / `getTransaction` request `maxSupportedTransactionVersion` starting
  at `0` and **auto-escalate** when the chain serves a newer tx version, so
  decoding keeps working as the network evolves.
- Block fetches are rate-limited (≤5/s) and cached (each slot fetched once).
- Dashboard is vanilla HTML/CSS/JS — no frameworks, dark theme, 5s auto-refresh.

## License

For research and defensive use.

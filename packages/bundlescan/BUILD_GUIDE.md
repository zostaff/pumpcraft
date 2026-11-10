# BUNDLESCAN — Build Guide

## Что это

MEV Bundle Analyzer для Solana. Детектирует sandwich атаки, арбитраж, показывает кто атакует, кого атакуют, сколько извлекают. Защитный/исследовательский инструмент.

---

## Шаг 1: Открой терминал

```bash
cd "/Volumes/DEXP W500C/bundlescan"
```

Модель: **Sonnet 5.5** (весь проект Node.js, без тяжёлого reasoning)

---

## Шаг 2: Вставь промпт

```
Построй bundlescan — платформа для real-time анализа MEV bundle активности на Solana. Детектирует sandwich атаки, арбитраж, ликвидации. Показывает кто атакует, кого атакуют, сколько извлекают. Исследовательский и защитный инструмент.

Архитектура:

bundlescan/
├── package.json
├── .env.example
├── README.md
├── lib/
│   ├── config.mjs            # .env загрузка
│   ├── constants.mjs         # program IDs, known MEV bots, tip accounts
│   ├── rpc.mjs               # Solana RPC + подключение
│   ├── listener.mjs          # блок-стрим: подписка на новые блоки/слоты
│   ├── tx-decoder.mjs        # универсальный декодер Solana транзакций
│   ├── bundle-detector.mjs   # определение бандлов в блоке (по tip transfers)
│   ├── sandwich-detector.mjs # детекция sandwich паттернов
│   ├── arb-detector.mjs      # детекция арбитражных бандлов
│   ├── profit-calc.mjs       # расчёт извлечённого профита
│   ├── victim-calc.mjs       # расчёт потерь жертвы
│   ├── simulator.mjs         # "что если" симуляция: виртуальный sandwich на любой tx
│   ├── tx-builder.mjs        # generic Jito bundle builder (любые инструкции → бандл)
│   ├── jito.mjs              # Jito Block Engine API client
│   └── logger.mjs            # цветной ANSI вывод
├── bot/
│   ├── scanner.mjs           # real-time сканер MEV активности
│   ├── wallet-guard.mjs      # мониторинг конкретного кошелька на sandwich атаки
│   ├── stats.mjs             # агрегированная статистика MEV за период
│   └── simulator-cli.mjs     # CLI для симуляции на конкретной транзакции
└── dashboard/
    ├── server.mjs            # HTTP сервер на localhost:3001
    ├── public/
    │   └── index.html        # single page dashboard (vanilla JS, dark theme)
    └── api.mjs               # JSON API для dashboard

Как определить бандл в блоке:
Бандл = группа транзакций в ОДНОМ слоте, связанных через tip transfer к known tip accounts:
  96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5
  HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe
  Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY
  ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49
  DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh
  ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt
  DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL
  3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT
Также: Astralane (astr* prefix), Nozomi (noz* prefix).
Один signer на несколько tx в одном слоте → бандл.

Как определить sandwich (sandwich-detector.mjs):
3 транзакции в одном блоке для одного mint:
  TX_1: Attacker ПОКУПАЕТ (front-run)
  TX_2: Жертва ПОКУПАЕТ (по худшей цене)
  TX_3: Attacker ПРОДАЁТ (back-run)
Условия:
  - trade[0].signer == trade[2].signer (один атакующий)
  - trade[1].signer != trade[0].signer (жертва — другой)
  - trade[0]=buy, trade[1]=buy, trade[2]=sell
  - Порядок в блоке: tx_index[0] < tx_index[1] < tx_index[2]
  - Tip transfer в одной из tx атакующего
Профит: trade[2].sol_received - trade[0].sol_spent - tip - fees
Потери жертвы: simulate(victim_sol, reserves_before_attack) - actual_tokens_received

Парсинг trade events:
pump.fun V3:
  Program: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
  Trade prefix: bddb7fd34ee661ee (390-391 bytes)
  Layout: [0-8] disc, [8-40] mint, [40-48] solAmount, [48-56] tokenAmount, [57-89] user, [97-105] virtualSolReserves, [105-113] virtualTokenReserves
  Buy/sell из logMessages: "Instruction: Buy/BuyV2/BuyV3/Sell/SellV2/SellV3"

PumpSwap AMM:
  Program: pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA
  Trade prefix: 67f4521f2cf57777 (497 bytes)
  Buy disc: 66063d1201daebea, Sell disc: 33e685a4017f83ad

Raydium V4: 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8
Orca Whirlpool: whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc
Jupiter: JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4

tx-decoder.mjs — универсальный декодер:
  getTransaction(sig, { maxSupportedTransactionVersion: 0 })
  Парсить: instructions, innerInstructions, preBalances/postBalances, preTokenBalances/postTokenBalances, logMessages
  Вернуть: { signature, slot, blockTime, signer, fee, instructions[], balanceChanges[], tokenChanges[] }

simulator.mjs — "что если" симуляция:
  Вход: tx signature + sandwich amount
  Рассчитать bonding curve math (BigInt):
    tokens_out = (sol_in * virtualTokenReserves) / (virtualSolReserves + sol_in)
    sol_out = (tokens_in * virtualSolReserves) / (virtualTokenReserves + tokens_in)
  Найти оптимальный размер front-run: перебор 0.01-10 SOL, максимизация profit
  Выход: victim_loss, attacker_profit, optimal_amount, slippage_needed_to_reject

tx-builder.mjs — generic Jito bundle builder:
  buildBundle(instructions[], signers[], config) → { transaction: VersionedTransaction v0, serialized: base58 }
  Стандартный набор: ComputeUnitLimit + ComputeUnitPrice + ...instructions + Jito tip
  buildBuyIx(mint, solAmount, minTokens, buyer) → Instruction
  buildSellIx(mint, tokenAmount, minSol, seller) → Instruction
  pump.fun V3 accounts (12): Global(4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf), FeeRecipient(CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJ5tGLDMDSRp), mint, bondingCurve(PDA ["bonding-curve",mint]), bondingCurveATA, buyerATA, buyer(signer), System, Token(TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA), Rent(SysvarRent111111111111111111111111111111111), EventAuth(Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1), PumpProgram
  Buy disc: d78f037c39e9b3b6, data: [8 disc][8 amount_in u64][8 min_tokens_out u64]
  Sell disc: 33e685a4017f83ad, data: [8 disc][8 token_amount u64][8 min_sol_out u64]

Боты:

bot/scanner.mjs — real-time MEV сканер:
  node bot/scanner.mjs [--min-profit 0.01] [--token <mint>]
  Подписка на новые блоки → для каждого блока: найти бандлы → классифицировать (sandwich/arb/liquidation/snipe) → рассчитать профит → вывести
  Красивый вывод с рамками:
  ┌─ SANDWICH DETECTED ──────────────┐
  │ Attacker: 7xKX...AsU             │
  │ Victim:   9pMH...Bgm             │
  │ Token:    DYdf...pump             │
  │ Profit:   +0.108 SOL             │
  │ Loss:     -0.094 SOL             │
  └──────────────────────────────────┘

bot/wallet-guard.mjs — защита кошелька:
  node bot/wallet-guard.mjs <wallet_address>
  Мониторит кошелёк, алертит если сэндвичнули, рекомендует снизить slippage

bot/stats.mjs — статистика:
  node bot/stats.mjs [--hours 24] [--top 20]
  Всего sandwich, общий объём, топ атакующих, топ токенов, средний профит, самый жирный

bot/simulator-cli.mjs — CLI симулятор:
  node bot/simulator-cli.mjs <tx_signature> [--amount 0.5]
  Симуляция sandwich на конкретной tx, оптимальный размер, при каком slippage tx отклонилась бы

Dashboard (dashboard/):
  server.mjs: HTTP на localhost:3001
  api.mjs: JSON endpoints
    GET /api/recent — последние 50 sandwich
    GET /api/stats — агрегированная стата
    GET /api/wallet/:addr — атаки на кошелёк
    GET /api/tx/:sig — анализ транзакции
    GET /api/simulate/:sig?amount=0.5 — симуляция
  public/index.html: vanilla JS, dark theme, monospace, auto-refresh 5s, live feed, графики, поиск

.env.example:
  RPC_URL, RPC_WSS, HELIUS_API_KEY
  SCAN_MIN_PROFIT=0.01
  SCAN_PROGRAMS=pumpfun,pumpswap,raydium,orca
  DASHBOARD_PORT=3001
  GUARD_WALLET=
  GUARD_ALERT_THRESHOLD=0.01
  SIM_DEFAULT_AMOUNT=0.5

Стек: Node.js 22+, ESM, @solana/web3.js ^1.98.0, @solana/spl-token ^0.4.12, bs58 ^6.0.0, dotenv ^16.0.0, ws ^8.18.0

Важно:
- Все финансовые расчёты BigInt, SOL в lamports
- getBlock с maxSupportedTransactionVersion: 0
- Парсить innerInstructions для CPI calls
- Rate limiting: не больше 5 getBlock/sec
- Кешировать блоки (один запрос один раз)
- Dashboard: NO frameworks, vanilla HTML/JS/CSS
- SIGINT handler: session stats
- Цветной вывод: profit зелёный, loss красный, tip жёлтый

Построй всё. Начни с lib/ (tx-decoder, bundle-detector, sandwich-detector), потом bot/scanner, потом dashboard. README последним.
```

---

## Шаг 3: Дождись завершения

Один терминал, один промпт. Всё строится в одном сеансе.

---

## Шаг 4: Проверка

```bash
# Проверить что всё на месте
ls -la lib/ bot/ dashboard/

# Установить зависимости
npm install

# Тест сканера (read-only, безопасно)
node bot/scanner.mjs --min-profit 0.01

# Тест симулятора на конкретной tx
node bot/simulator-cli.mjs <любая_tx_signature>

# Запустить dashboard
node dashboard/server.mjs
# Открыть http://localhost:3001
```

---

## Шаг 5: Git + Push

```bash
cd "/Volumes/DEXP W500C/bundlescan"
git init
git add -A
git commit -m "initial: bundlescan MEV analyzer"
# Создать репо на GitHub: zostaff/bundlescan
git remote add origin git@github.com:zostaff/bundlescan.git
git push -u origin main
```

---

## Режимы использования

```bash
# Live сканер — наблюдать MEV атаки в реальном времени
node bot/scanner.mjs

# Защита кошелька — алерт если тебя сэндвичат
node bot/wallet-guard.mjs <твой_кошелёк>

# Статистика — сколько MEV за последние 24ч
node bot/stats.mjs --hours 24

# Симуляция — "что было бы если сэндвичнуть эту tx"
node bot/simulator-cli.mjs <signature> --amount 0.5

# Dashboard — веб-UI со всей аналитикой
node dashboard/server.mjs
```

---

## Что получишь

Готовые компоненты которые можно использовать как библиотеку:

| Модуль | Что делает | Самостоятельно полезен |
|--------|-----------|----------------------|
| tx-decoder.mjs | Декодирует любую Solana tx | Да — CLI инструмент |
| bundle-detector.mjs | Находит бандлы в блоке | Да — MEV research |
| sandwich-detector.mjs | Детектирует sandwich | Да — protection |
| simulator.mjs | Симулирует sandwich на tx | Да — "что если" |
| tx-builder.mjs | Собирает Jito бандлы | Да — generic builder |
| profit-calc.mjs | Считает профит атакующего | Да — analytics |
| victim-calc.mjs | Считает потери жертвы | Да — protection |

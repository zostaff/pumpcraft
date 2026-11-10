# PUMPGHOST — Build Guide

## Что это

Stealth presence toolkit для pump.fun. Два режима:
- **Bump** — микропокупки чтобы токен оставался наверху ленты pump.fun
- **Maker** — распределение пыли на сотни кошельков чтобы раздуть holder/maker count

Цель: показать КАК работают эти инструменты изнутри. Research & education tool.

---

## Шаг 1: Изучи референс

Прочитай эти файлы для понимания wallet pool и trade механики:

```
/Volumes/DEXP W500C/team-launchpad/trade.mjs    — трейд билдер (145 строк)
/Volumes/DEXP W500C/team-launchpad/bundler.mjs  — wallet generation, funding, drain (строки 180-350)
```

Изучи только:
- `generateWallets()` — генерация кошельков
- `fundWallets()` — funding через SystemProgram.transfer
- `drainWallets()` — drain SOL обратно
- `buildBuyTx()` / `buildSellTx()` — построение сделок через pump-sdk
- `toKeypair()`, `buildSignedTx()`, `sendTx()` — утилиты

---

## Шаг 2: Открой терминал

```bash
cd "/Volumes/DEXP W500C/pumpghost"
```

Модель: **Sonnet 5.5**

---

## Шаг 3: Вставь промпт

```
Ты строишь PUMPGHOST — stealth presence toolkit для pump.fun. Сначала прочитай референсную реализацию:

  /Volumes/DEXP W500C/team-launchpad/trade.mjs
  /Volumes/DEXP W500C/team-launchpad/bundler.mjs (только строки 1-550, wallet pool + trade builders)

Изучи generateWallets(), fundWallets(), drainWallets(), buildBuyTx(), toKeypair(), buildSignedTx(), sendTx(). Пойми механику, но НЕ копируй код. Напиши свою реализацию.

Архитектура:

pumpghost/
├── package.json
├── .env.example
├── README.md
├── lib/
│   ├── config.mjs          # .env загрузка
│   ├── constants.mjs       # program IDs, tip accounts
│   ├── wallet-pool.mjs     # генерация N кошельков, fund, drain
│   ├── trade.mjs           # buy/sell через @pump-fun/pump-sdk
│   ├── dust.mjs            # SPL token transfer пыли
│   └── logger.mjs          # цветной ANSI вывод
├── modes/
│   ├── bump.mjs            # bump mode — микропокупки для trending
│   ├── maker.mjs           # maker mode — раздувание holder count
│   └── common.mjs          # shared: job state, SIGINT, stats
├── cli/
│   ├── ghost.mjs           # CLI точка входа
│   ├── status.mjs          # статус текущих jobs
│   └── drain.mjs           # аварийный drain всех кошельков
└── dashboard/
    ├── server.mjs           # HTTP на localhost:3003
    └── public/
        └── index.html       # dark theme dashboard

ЧТО ДЕЛАТЬ:

1. wallet-pool.mjs:
   - generatePool(count) → [{publicKey, secretKey}]
   - fundPool(conn, master, wallets, solPerWallet) — перевод SOL каждому, 500ms задержка
   - drainPool(conn, wallets, master) — собрать весь SOL обратно
   - getBalances(conn, wallets) → [{wallet, sol, tokens}]

2. trade.mjs:
   - Использовать @pump-fun/pump-sdk (OnlinePumpSdk, PumpSdk)
   - buildBuy(conn, sdk, globals, mint, buyer, solLamports, slippage, tokenProgram)
   - buildSell(conn, sdk, globals, mint, seller, tokenAmount, slippage, tokenProgram)
   - sendTx(conn, ixs, signer, priorityFee) — подписать и отправить

3. dust.mjs:
   - distributeDust(conn, sourceKeypair, wallets, mint, amountPerWallet)
   - Для каждого кошелька: createAssociatedTokenAccountIdempotent + transferInstruction
   - Минимальная сумма: 1 token unit (самая маленькая пыль)

4. modes/bump.mjs — BUMP MODE:
   - bump(conn, opts) — цикл микропокупок
   - Параметры: mint, master, numWallets (3-5), intervalSec (30-120), buySol (0.001-0.005), durationMin
   - Логика:
     a) Сгенерировать 3-5 кошельков
     b) Профундить каждый на buySol * cycles * 1.5
     c) Цикл: каждые intervalSec секунд один случайный кошелёк покупает buySol
     d) Rotation: каждый раз другой кошелёк (round-robin)
     e) НЕ продавать — только микропокупки (держит токен наверху)
     f) По окончании: drain SOL обратно (токены остаются)
   - Stats: total bumps, SOL spent, avg interval

5. modes/maker.mjs — MAKER MODE:
   - inflate(conn, opts) — раздувание holder count
   - Параметры: mint, master, targetHolders (50-500), dustAmount (1 token unit)
   - Логика:
     a) Master покупает токены (или уже есть)
     b) Сгенерировать targetHolders кошельков
     c) Профундить каждый на 0.003 SOL (rent для ATA)
     d) Создать ATA + transfer dust на каждый кошелёк
     e) Batch по 10 кошельков, 1s задержка между batch
     f) Stats: holders created, dust distributed, SOL spent on rent
   - НЕ drain SOL из maker кошельков (иначе ATA закроется)

6. cli/ghost.mjs — единая точка входа:
   node cli/ghost.mjs bump --mint <CA> --interval 60 --buy 0.002 --duration 30
   node cli/ghost.mjs maker --mint <CA> --holders 100
   node cli/ghost.mjs bump --dry-run --mint <CA>
   - --dry-run: логировать без реальных транзакций
   - SIGINT: остановить цикл, показать stats

7. cli/status.mjs:
   node cli/status.mjs — показать активные и прошлые jobs

8. cli/drain.mjs:
   node cli/drain.mjs --all — drain SOL из всех кошельков текущего job
   node cli/drain.mjs --job <id> — drain конкретного job

9. Dashboard:
   - GET /api/jobs — список jobs (bump/maker)
   - GET /api/jobs/:id — детали
   - POST /api/bump — запустить bump
   - POST /api/maker — запустить maker
   - POST /api/drain/:id — drain job
   - index.html: vanilla JS, dark theme, live stats

10. README.md:
    - <!-- BANNER IMAGE HERE -->
    - Что делает (одна строка)
    - ASCII flow: Master → Fund Pool → Bump/Maker → Stats
    - Два режима с примерами
    - Config table
    - CLI commands
    - CAN / CANNOT
    - "This is a research tool" disclaimer
    - How bump bots keep tokens trending
    - How holder bots inflate metrics
    - How to DETECT these bots (обратная сторона)

ЧТО НЕ ДЕЛАТЬ (КРИТИЧНО):

❌ НЕ делать hop wallets / промежуточные кошельки
❌ НЕ делать Jito bundles — только обычные транзакции
❌ НЕ делать dynamic priority fee — фиксированный из .env
❌ НЕ делать auto-sell / auto-rug функционал
❌ НЕ делать create token — только работа с существующими
❌ НЕ делать sniper trap логику
❌ НЕ делать wallet encryption
❌ НЕ делать bundled create+buy
❌ НЕ копировать код из team-launchpad — своя реализация

.env.example:
  RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
  WALLET_PRIVATE_KEY=
  DRY_RUN=true
  PRIORITY_FEE=300000
  BUMP_INTERVAL_SEC=60
  BUMP_BUY_SOL=0.002
  BUMP_WALLETS=4
  BUMP_DURATION_MIN=30
  MAKER_TARGET_HOLDERS=100
  MAKER_DUST_AMOUNT=1
  MAKER_BATCH_SIZE=10
  DASHBOARD_PORT=3003

Стек: Node.js 22+, ESM, @pump-fun/pump-sdk, @solana/web3.js ^1.98.0, @solana/spl-token ^0.4.12, bs58 ^6.0.0, dotenv ^16.0.0

Важно:
- BigInt для всех финансовых расчётов
- VersionedTransaction v0
- ComputeUnitLimit 250000, ComputeUnitPrice из PRIORITY_FEE
- SIGINT: stop bump/maker loop, print session stats
- Цветной лог: bump фиолетовый, maker голубой, fund жёлтый, drain синий
- Rate limiting: не больше 2 RPC calls/sec
- Error retry: 1 раз, потом skip и продолжить

Построй всё. Начни с lib/, потом modes/, потом cli/, потом dashboard. README последним.
```

---

## Шаг 4: Проверка

```bash
ls -la lib/ modes/ cli/ dashboard/
npm install

# Bump dry run
node cli/ghost.mjs bump --dry-run --mint DYdfuR9GoeNHp1eTRiqkNSMVGPpSTQCgjiQ8Hvhxpump --duration 5

# Maker dry run
node cli/ghost.mjs maker --dry-run --mint DYdfuR9GoeNHp1eTRiqkNSMVGPpSTQCgjiQ8Hvhxpump --holders 10

# Dashboard
node dashboard/server.mjs
# http://localhost:3003
```

---

## Шаг 5: Git + Push

```bash
cd "/Volumes/DEXP W500C/pumpghost"
git init
git add -A
git commit -m "initial: pumpghost stealth presence toolkit"
git remote add origin git@github.com:zostaff/pumpghost.git
git push -u origin main
```

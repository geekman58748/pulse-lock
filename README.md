# PulseLock

**Real-time Solana launch & liquidity conviction engine.** Solami Earn bounty — Sept '26.

Watch new pools/launches live, score conviction 0–100 with a *visible breakdown*,
alert high-signal only. Read-only. Zero gas. Mainnet, live-only.

Solami is the entire data path: **Blur** (decoded market events) feeds breadth,
**Yellowstone gRPC** (filtered, with `fromSlot` slot replay) feeds depth on hot pools.

## Status

- [x] Day 1 — Blur WS ingestion (all event types → JSONL log), gRPC slots stream,
      conviction score engine with visible breakdown, console dashboard, slot-replay test
- [x] Day 2 — web dashboard (dark, from `mockup/`), Discord/Telegram alerts,
      live mainnet verified: firehose + gRPC + replay test PASS (31 missed slots
      recovered), alert chain firing with 35–431ms latency stamps
- [ ] Day 3 — reconnect demo hardening, README polish, public repo + Loom

## Run (< 5 min)

Prereqs: **Node ≥ 24** (native TypeScript execution, no build step).

```bash
git clone <this-repo> && cd pulselock
npm install
cp .env.example .env        # paste your Solami API key
npm start                    # live console dashboard (Ctrl-C to exit)

npm run grpc:test            # slot-replay acceptance test
```

Get a key (Pro free for 7 days — covers everything in this build):
**https://solami.dev/signup?ref=st-earn-sep-26**

## Env vars

| Var | Required | Default | Purpose |
|---|---|---|---|
| `SOLAMI_API_KEY` | ✅ | — | Blur WS auth (`api_key` query param) |
| `SOLAMI_WS_ENDPOINT` | – | `wss://ws.solami.dev/data/subscribe` | Blur WS base URL |
| `SOLAMI_GRPC_ENDPOINT` | – | `https://grpc.solami.dev` | Yellowstone gRPC endpoint |
| `SOLAMI_GRPC_TOKEN` | – | falls back to `SOLAMI_API_KEY` | gRPC `x-token` metadata |
| `MIN_LIQUIDITY_USD` | – | `2000` | pool eligibility floor |
| `DEEP_DIVE_THRESHOLD` | – | `60` | score → gRPC filtered tx sub |
| `LOG_EVENTS` | – | `1` | `0` disables the JSONL event log |
| `DISCORD_WEBHOOK_URL` | – | – | Day 2 alert sink |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | – | – | Day 2 alert sink |

## Architecture

```
Solami Blur WS ──────── every decoded event ─┐   (breadth: all DEXes, all pools)
                                             ├─→ in-memory Registry (rolling 60s/10s windows)
Solami Yellowstone ──── slots always on ─────┤        │
   gRPC                 tx filter on hot     ┘        ↓
   (fromSlot replay     pools only (depth)      Conviction score 0–100
    on reconnect)                               with visible breakdown
                                                     │
                                        ┌────────────┼────────────┐
                                        ↓            ↓            ↓
                                  console/web    ≥75 alerts    deep-dive tx
                                   dashboard    Discord/TG     gRPC filter
```

- **Firehose breadth** — one Blur WS carries swap/liquidity/pool_create/token_create/
  meme/graduation/surge/radar/token_update/stats across every major DEX.
- **Hybrid depth** — gRPC stays on a cheap slots-only subscription; pools crossing
  `DEEP_DIVE_THRESHOLD` get a filtered transactions subscription (filters fully
  replace per request — bandwidth only widens when it matters).
- **Explainable score** — every score renders as `+28 wallet velocity +24 buy/sell
  imbalance +11 liquidity added … = 82`. No black box.
- **Reconnect proof** — kill the gRPC stream (`drop()` in code, or wifi on camera):
  reconnect carries `fromSlot = lastSeen + 1`, the server replays the gap.
  `npm run grpc:test` prints recovered updates.

## Formatting spec

Exact from `mockup/dashboard.html`: `fmtUSD` ($1.2M / $45.2K / $8.10),
`fmtPct` (rounds to whole), `fmtAge` (`3m 12s`), scores `>=75` green / `>=55` amber / gray.

## License

MIT

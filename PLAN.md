# PulseLock — LOCKED SPEC
> Real-time Solana launch & liquidity conviction engine. Solami Sept '26 Earn bounty.
> Status: plan locked. Build starts ONLY after current hackathon is shipped.

## Product (one line)
Watch new pools/launches live, deep-dive the hot ones, score conviction 0–100
with a visible breakdown, alert high-signal only. Read-only. Zero gas.

## Locked differentiators (the execution edge)
1. **First 30–90s obsession** — unique wallets/10s, buy-pressure spike, liquidity velocity
2. **Hybrid depth**: Blur firehose (breadth) → auto Yellowstone gRPC deep-dive ONLY on pools crossing threshold
3. **Explainable score** — live breakdown ("+28 wallet velocity, +19 buy/sell imbalance, +15 liquidity added")
4. **Alert quality > quantity** — metrics + Birdeye/Photon/Axiom links, no spam
5. **Stream health + latency on screen** — data freshness, reconnect behavior visible
6. **The reconnect demo** — kill wifi on camera, slot replay closes the gap, zero missed pools

## Solami usage (judge criterion 1)
- **Blur WS** = primary data path (pools, launches, trades, liquidity) — decoded, no parsing
- **Yellowstone gRPC** = selective depth on hot pools (filtered accounts) + slot replay
- Webhooks = alert delivery. Mirage = fallback if gRPC client fights back.
- **Beam = DEAD unless everything else ships.** Data API = convenience only.
Two products deep > six products shallow.

## CUT LIST (decided now, not mid-sprint)
- ❌ Beam snipe (drags in wallets/gas/liability)
- ❌ VPS/Railway deploy (repo + video of local live run satisfies the bounty)
- ⚠️ Charts/flourish — only if ahead of schedule
- ⚠️ Keyboard shortcuts — last polish item, first to die

## Fallback ladder (day 3 reality check)
Behind? → dashboard = plain dark table → charts die → Beam stays dead →
README STILL GETS WRITTEN. Demo sequence is the win condition:
live slots ticking → pool event → score updating → alert firing w/ latency stamp.

## 3-day plan
- **Day 1:** sign up (trial clock starts), Blur WS logging all events, gRPC filtered
  subs working, slot replay tested, in-memory aggregation
- **Day 2:** conviction score tuned on live data, dark table + detail pane,
  webhook alerts, reconnect/edge handling
- **Day 3:** elite README (<5min run), record 2–3min Loom, edge cases, open source

## Submission checklist
- [ ] Solami = the entire data path, 2+ products doing real work
- [ ] Public repo, no secrets, key via env var
- [ ] README: setup, env vars, point-at-your-own-key
- [ ] 2–3 min demo: LIVE mainnet (slots ticking, not canned logs)
- [ ] Metrics: launches, volume, unique wallets, buy/sell pressure, liquidity in/out, score
- [ ] Works. A submission that does not run live is not judged.

## Stack
TypeScript + Bun/Node · official Yellowstone client · Next.js + Tailwind (minimal dark)
· in-memory state + JSON persistence · Discord/Telegram webhook alerts

## Env (see .env.example) — NEVER COMMIT REAL KEYS

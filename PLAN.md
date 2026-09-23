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

---

## SESSION NOTES — understandings locked for review (added Day 3)
### Verified working (live mainnet, 2026-09-22/23)
- Blur WS + gRPC both green: ~470 events/s, freshness 0.35–0.84s, 0 reconnects, pongs flowing
- Registry: 3,201 pools in a 3-min run; `data/state.json` persistence + graceful SIGINT save OK
- Alert chain PROVEN: `ALERT_THRESHOLD=55` → 265 alerts in 3min, latency stamps 35–431ms after event. Threshold RESTORED to 75.
- Slot replay PASS: forced drop → `fromSlot=lastSeen+1` → 31 missed updates recovered. (Rerun until the "gap closed" variant prints for the camera; the "PASS (resumed)" variant with 0 recovered is also valid but weaker on video.)
- Web endpoints all 200: `/` landing, `/app` terminal, `/api/snapshot` JSON, `/stream` SSE (1s cadence)
- Live event shapes confirmed match parser — `swap{trader,side,volume_usd,block_time}`, `liquidity{kind,…}`, `token_create{name,symbol,creator}`, `pool_create{…}`. No parser changes needed.

### Decisions locked this session
1. **One-click ACT, NOT one-click trade** — deep links with pre-filled mint. Photon = primary (URL takes token directly), Axiom/Birdeye secondary. Zero custody/keys/tx-building. Wired in: detail pane `⚡ ACT ON PHOTON` button, alert toasts (8s linger), footer alert log inline links, webhook `ACT →` line, console log `act <url>`.
2. **Positioning = "conviction terminal"** (README + landing copy). Not a watcher, not a custody terminal.
3. **v2 = Solami Beam execution layer, deliberate scope cut** — README roadmap line + landing "Roadmap v2" plan card both state it (cuts read as scoping discipline to judges).
4. **Landing page YES**: `/` = landing (Desktop Trenox template adapted + fully reworded, zero Trenox/Youflow strings left), `/app` = terminal. Console log line + README Run section updated.
5. Cut list above unchanged — Beam snipe stays dead, no deploy, charts/shortcuts first to die.
6. **Charts = Option B** (price + sparkline). Candles already flow (77,891 per 30min run) — Option C (lightweight-charts candlesticks) only if ahead after hard test + GitHub push. Price metric covers the brief's *per-token price* requirement either way.
7. **Telegram bot CTA**: bot token in `.env`; dashboard CTA (Alerts view button + sidebar link, both hidden until `TELEGRAM_BOT_USERNAME` is set) deep-links `t.me/<bot>` so users add the bot for push alerts. First token attempt = 401 Unauthorized → needs valid token from @BotFather before CTA goes live; then chat id via `getUpdates` once the user /starts the bot → `TELEGRAM_CHAT_ID` for actual delivery.
8. **Self-serve subscriptions (the judge-proof fix)**: `src/telegram.ts` long-poll loop auto-registers any chat that taps START (≤25s), persists `data/subscribers.json` (gitignored), sends a welcome, broadcasts every alert to ALL subscribers, prunes blocked chats. No manual chat-id step — judges/visitors just tap START and receive. `TELEGRAM_CHAT_ID` demoted to optional bootstrap only.

### Known front-end bugs / debt (fix in the hard-test pass)
- [ ] **WSOL mint mislabel**: `pool_create` with base=WSOL indexes mint=WSOL → token metadata fans out; a SOL/USDC pool renders label "SOL", and `token_update liqUsd` can fan out to wrong pools. Display-only, scores unaffected. Fix: prefer non-WSOL/USDC mint as primary in `ensure()`/`token_create`.
- [ ] **Broken template images**: `/assets/*` srcsets 404 (og share image already repointed), flag SVGs still named `China.svg` etc. (render fine as DEX labels), `/_next/static` preloads 404.
- [ ] **Dead `./pages/*.html` links** in landing nav dropdown + utility entries (pages/ never shipped) — retarget or delete.
- [ ] **Hydration risk**: `./scripts/*.js` are local and may run → React may re-assert RSC payload strings over static DOM. Payload variants were edited too, but confirm visually in browser during hard test.
- [ ] **`TrenoxScripts` JS identifier** left in place (invisible; renaming may break template scripts — touch only if needed).
- [ ] **100% BUY column** on micro-pools = real data (first trades of a launch are buys), NOT a parser bug — full log split is 64/36. Confirm judges don't read it as broken.
- [ ] **Demo never alerts at 75**: fixture peaks at score 66 → use `ALERT_THRESHOLD=60 npm run demo` for demo alert showcase.
- [ ] **Discord/TG webhooks never tested against a real endpoint** — no webhook URL was set. Set `DISCORD_WEBHOOK_URL` once and fire a test.
- [ ] Landing page not yet eyeballed in a real browser (only curl-verified).

### Test recipes (hard test + Loom)
- Live: `npm start` (key in `.env`)
- Fast alerts: `ALERT_THRESHOLD=55 npm start`
- Deep-dive filters early: `DEEP_DIVE_THRESHOLD=45 npm start`
- Demo (no key): `npm run demo` · demo w/ alerts: `LOG_EVENTS=0 ALERT_THRESHOLD=60 npm run demo`
- Replay: `npm run grpc:test`

### Repo / submission state
- git initialized: 4 commits (`5fc6108` initial, `6071af5` replay-report fix, `628fbd4` act deep-links + positioning, `35bc388` landing). **NOT pushed anywhere yet** — public GitHub repo = hard submission requirement, still open.
- Secrets: key in `.env` (gitignored, verified absent from every commit). **ROTATE THE KEY AFTER THE BOUNTY** — it passed through chat.
- README: Day 1+2 checked with evidence, landing checked, Day 3 open (reconnect hardening, public repo, Loom).

### Bounty alignment (reviewed against official brief, Day 3)
- Brief allows: *trading bot, indexer, alert system, dashboard, dev tool, SDK* — we submit **alert system + dashboard**, powered by 2 Solami products (Blur WS + Yellowstone gRPC w/ slot replay). Req #1 satisfied twice. Beam execution = documented v2 cut = scoping discipline, not a gap.
- **Optional post-submission stretch (after push → Loom → hard test): Beam buy button** next to ⚡ Photon — throwaway demo wallet, dust on camera. The only thing that makes it a literal trading bot. Real scope add (signing/funds/failure states) — do NOT pull it forward.
- Solami's **Webhooks** (inbound push) NOT used — unnecessary; Blur WS + gRPC already carry req #1. Ours are outbound alert webhooks (Discord/TG), a different thing.
- **Telegram = our alert delivery channel** (Alerter → Bot API), the "alert quality > quantity" differentiator made useful on-phone: metrics + latency stamp + ⚡ Photon deep link per alert. Wired in config.ts (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) but **never tested against a real bot** — setup: @BotFather token → message bot → grab chat id from `getUpdates` → `.env` → `ALERT_THRESHOLD=55 npm start` proves it.
- **Metrics gap check vs brief**: price (`price_usd`) is in every swap event but never surfaced — easy win. Liquidity removes are ignored (brief says *in and out*) — easy win. 24h volume + holders = bigger (longer windows / Data API) — skip unless ahead of schedule.

### Remaining sprint order
1. **Dashboard (current — new template incoming from user, wire it against snapshot/SSE contract)**
2. Metrics wins while waiting: surface price + net liquidity (in − out)
3. Front-end hard test pass (the debt list above)
4. Push public GitHub repo
5. Telegram end-to-end test (needs user's BotFather token + chat id)
6. Broken images pass
7. Loom: live slots ticking → pool event → score climbing → alert + latency stamp → kill connection → fromSlot replay closes gap → ⚡ Photon act click
8. Stretch only if all green: Beam buy button (demo wallet)

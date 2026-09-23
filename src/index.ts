import { config, requireKey, log, errMessage } from './config.ts'
import { events } from './log.ts'
import { startBlur, type BlurHandle } from './blur.ts'
import { startGrpc, type GrpcHandle } from './grpc.ts'
import { Registry, type PoolRow } from './aggregate.ts'
import { Alerter } from './alerts.ts'
import { startServer, type Snapshot } from './server.ts'
import { startDemo, type DemoHandle } from './demo.ts'
import { startTelegramPoll } from './telegram.ts'
import { fmtUSD, fmtPct, fmtAge } from './format.ts'

/* Formatting — exact spec from mockup/dashboard.html */
const fmtSlot = (n: number): string => (n > 0 ? n.toLocaleString('en-US') : '—')

const RESET = '\x1b[0m'
const DIM = '\x1b[90m'
const BOLD = '\x1b[1m'

const scoreColor = (n: number): string =>
  n >= config.alertThreshold ? '\x1b[32m' : n >= 55 ? '\x1b[33m' : '\x1b[90m'

async function main(): Promise<void> {
  const demo = process.argv.includes('--demo') || process.env.DEMO === '1'
  if (!demo) requireKey()
  log.info(
    demo
      ? 'PulseLock — SYNTHETIC DEV FEED (fixtures through the real pipeline)'
      : 'PulseLock — Solami Blur + Yellowstone gRPC — MAINNET LIVE',
  )

  const registry = new Registry()
  if (!demo) registry.load()
  startTelegramPoll() // auto-register anyone who /starts the bot

  const alerter = new Alerter()
  alerter.restore()
  let blur: BlurHandle | null = null
  let grpc: GrpcHandle | null = null
  let feed: DemoHandle | null = null

  const logEvent = (e: unknown): void => {
    if (config.logEvents) events.write(e)
  }
  const onEvent = (e: unknown): void => registry.ingest(e)

  if (demo) {
    feed = startDemo((e) => {
      logEvent(e)
      onEvent(e)
    })
  } else {
    blur = startBlur({
      apiKey: config.apiKey,
      endpoint: config.wsEndpoint,
      onEvent,
      logEvent,
    })
    grpc = startGrpc({
      endpoint: config.grpcEndpoint,
      token: config.grpcToken,
      autoReconnect: true,
    })
  }

  const freshness = (): number | null => {
    if (!blur) return null
    const f = blur.freshnessMs()
    return f === Infinity ? null : f
  }

  let rows: PoolRow[] = registry.rows()
  const deepDive = new Set<string>()

  const snapshot = (): Snapshot => ({
    demo,
    t: Date.now(),
    telegramBot: config.telegramUsername,
    header: {
      slot: grpc?.stats().lastSlot ?? 0,
      freshnessMs: freshness(),
      firehose: blur?.state().connected ?? false,
      deepN: rows.filter((r) => r.state === 'deep').length,
      blurReconnects: Math.max(0, (blur?.state().connects ?? 1) - 1),
      grpcReconnects: grpc?.stats().reconnects ?? 0,
      replayed: grpc?.stats().replayed ?? 0,
      pongs: grpc?.stats().pongs ?? 0,
      gRPCGaveUp: grpc?.stats().givingUp ?? false,
      events: events.total,
      pools: rows.length,
    },
    pools: rows.slice(0, 50),
    alerts: alerter.list,
  })

  /* One shared 1s tick: recompute rows, fire alerts, widen deep-dive filters */
  const engine = setInterval(() => {
    rows = registry.rows()
    for (const r of rows) {
      if (r.state === 'deep') alerter.maybeFire(r, freshness())
      if (
        grpc &&
        r.score.total >= config.deepDiveThreshold &&
        !deepDive.has(r.key) &&
        deepDive.size < 5
      ) {
        deepDive.add(r.key)
        grpc.setTxAccounts([...deepDive])
      }
    }
    // live PnL on fired alerts: last known swap price vs price at the call
    for (const a of alerter.list) {
      const st = registry.pools.get(a.key)
      if (!st) continue
      let lp = a.priceNow
      for (let i = st.swaps.length - 1; i >= 0; i--) {
        if (st.swaps[i].price > 0) { lp = st.swaps[i].price; break }
      }
      a.priceNow = lp
      // track the peak since the call — the alert's honest "it caught the top" proof
      if (a.priceAt > 0 && lp > (a.peakPrice ?? a.priceAt)) a.peakPrice = lp
      a.pnlPct = a.priceAt > 0 && lp > 0 ? ((lp - a.priceAt) / a.priceAt) * 100 : null
      // keep a price-series snapshot on the alert so its card works even after
      // the pool drops out of the registry (restart / eviction)
      a.hist = []
      for (let i = st.swaps.length - 1; i >= 0 && a.hist.length < 60; i--) {
        const s = st.swaps[i]
        if (s.price > 0) a.hist.unshift({ t: s.t, p: s.price })
      }
    }
    if (++persistTick % 5 === 0) alerter.persist()
  }, 1000)
  let persistTick = 0

  const port = Number(process.env.PORT) || 4173
  const web = startServer({ port, getSnapshot: snapshot })

  /* Console mirror — stream health visible in the terminal too */
  const render = (): void => {
    const s = snapshot()
    const h = s.header
    const fresh = h.freshnessMs == null ? '—' : (h.freshnessMs / 1000).toFixed(2) + 's'

    const lines: string[] = []
    lines.push(
      `${BOLD}PULSELOCK${RESET}${DIM} · ${demo ? 'SYNTHETIC DEV FEED' : 'MAINNET · LIVE-ONLY'}${RESET}   ` +
        `slot ${fmtSlot(h.slot)} · freshness ${fresh} · ` +
        `${h.firehose ? '\x1b[32m' : '\x1b[31m'}● firehose${RESET} ` +
        `${demo ? `${DIM}○ deep (n/a)${RESET}` : `${h.gRPCGaveUp ? '\x1b[31m' : '\x1b[32m'}● deep${RESET}`} ` +
        `${DIM}· reconnects blur:${h.blurReconnects} grpc:${h.grpcReconnects}` +
        (h.replayed > 0 ? ` (replay: ${h.replayed} recovered)` : '') +
        ` · pings ${h.pongs}` +
        ` · events ${h.events.toLocaleString('en-US')}${RESET}`,
    )
    lines.push(
      DIM +
        ' #  SCORE            TOKEN / POOL              AGE       LIQ        1M VOL    W/10S  BUY   STATE' +
        RESET,
    )

    const top = s.pools.slice(0, 9)
    top.forEach((r, i) => {
      const n = r.score.total
      const barLen = Math.max(1, Math.round(n / 5))
      const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen)
      const state = r.state.toUpperCase()
      const stateColor = r.state === 'deep' ? '\x1b[32m' : r.state === 'watch' ? '\x1b[33m' : DIM
      lines.push(
        `${String(i + 1).padStart(2)}  ${scoreColor(n)}${String(n).padStart(3)}${RESET} ` +
          `${scoreColor(n)}${bar}${RESET} ` +
          `${r.label.padEnd(18).slice(0, 18)} ${r.dex.slice(0, 7).padEnd(7)} ` +
          `${DIM}${fmtAge(r.ageSec).padStart(8)}${RESET} ` +
          `${fmtUSD(r.liqUsd).padStart(9)} ` +
          `${fmtUSD(r.vol60).padStart(10)} ` +
          `${String(r.w10).padStart(6)} ` +
          `${fmtPct(r.buyRatio).padStart(5)} ` +
          `${stateColor}${state}${RESET}`,
      )
    })
    if (top.length === 0) lines.push(DIM + '   waiting for pools… (Blur firehose warming up)' + RESET)

    const best = top[0]
    if (best) {
      lines.push('')
      lines.push(
        `${BOLD}${best.label}${RESET} ${DIM}breakdown${RESET} ` +
          best.score.parts.map((p) => `${DIM}+${p.pts}${RESET} ${p.name.toLowerCase()}`).join(' ') +
          ` ${DIM}=${RESET}${scoreColor(best.score.total)}${BOLD}${best.score.total}${RESET}`,
      )
    }

    for (const a of alerter.list.slice(0, 2)) {
      lines.push(
        `\x1b[35mALERT${RESET} ${a.label} score ${a.score} · fired ${a.latencyMs}ms after event`,
      )
    }

    if (h.gRPCGaveUp) {
      lines.push('\x1b[31mgRPC unavailable — running Blur-only (check SOLAMI_GRPC_*)' + RESET)
    }
    if (demo) {
      lines.push(DIM + 'npm run demo = fixtures through the real pipeline. Submission runs live.' + RESET)
    }

    process.stdout.write('\x1b[2J\x1b[H' + lines.join('\n') + '\n')
  }

  const consoleTimer = setInterval(render, 2000)
  const saver = demo ? null : setInterval(() => registry.save(), 15_000)

  process.on('SIGINT', () => {
    clearInterval(engine)
    clearInterval(consoleTimer)
    if (saver) clearInterval(saver)
    if (!demo) registry.save()
    web.close()
    blur?.stop()
    grpc?.stop()
    feed?.stop()
    events.close()
    process.stdout.write('\n')
    log.info('saved. bye.')
    process.exit(0)
  })

  render()
}

main().catch((e) => {
  log.error('fatal:', errMessage(e))
  process.exit(1)
})

/**
 * Blur — decoded market data over a plain WebSocket.
 * wss://ws.solami.dev/data/subscribe?chain=solana&api_key=…
 *
 * Protocol (from Solami's own dashboard reference):
 * - auth via ?api_key= (headers unavailable in browsers/WS)
 * - filters are sent over the socket as a top-level JSON object and are
 *   live-changeable; `{}` (empty filter) = the full firehose
 * - list snapshots (trending/launches/graduating/graduated) arrive on connect
 *   and every 30s; `backfill: N` replays the last N events per type on connect
 * - close 4002 = streaming bandwidth AND prepaid balance both empty
 */

export const BLUR_TYPES = [
  'swap',
  'liquidity',
  'pool_create',
  'token_create',
  'transfer',
  'candle',
  'stats',
  'meme',
  'graduation',
  'surge',
  'radar',
  'trending',
  'launches',
  'graduating',
  'graduated',
  'metadata',
] as const

export interface BlurState {
  connected: boolean
  connects: number
  frames: number
  byType: Record<string, number>
  lastFrameAt: number // ms epoch, 0 = never
}

export interface BlurHandle {
  state(): BlurState
  /** ms since last frame (Infinity if nothing received yet) */
  freshnessMs(): number
  /** live server-side filter narrowing, e.g. { pools: [...] } */
  setFilter(f: Record<string, unknown>): void
  stop(): void
}

export interface BlurOpts {
  apiKey: string
  endpoint: string
  onEvent: (e: unknown) => void
  logEvent: (e: unknown) => void
}

export function startBlur(opts: BlurOpts): BlurHandle {
  const base = opts.endpoint.includes('/data/subscribe')
    ? opts.endpoint
    : opts.endpoint.replace(/\/$/, '') + '/data/subscribe'
  // no undocumented query params: filters travel as socket messages
  const url = `${base}?chain=solana&api_key=${encodeURIComponent(opts.apiKey)}`

  let ws: WebSocket | null = null
  let stopped = false
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const st: BlurState = { connected: false, connects: 0, frames: 0, byType: {}, lastFrameAt: 0 }

  function connect(): void {
    const sock = new WebSocket(url)
    ws = sock

    sock.addEventListener('open', () => {
      st.connected = true
      st.connects++
      const label = st.connects === 1 ? 'first connect' : `reconnect #${st.connects - 1}`
      console.log(`[blur] connected (${label})`)
      // empty filter = full firehose (documented). List snapshots arrive
      // immediately on connect, so the dashboard has data from second one.
      try {
        sock.send('{}')
      } catch {
        /* socket died between open and send */
      }
    })

    sock.addEventListener('message', (ev) => {
      st.frames++
      st.lastFrameAt = Date.now()
      let e: unknown
      try {
        e = JSON.parse(String(ev.data))
      } catch {
        return
      }
      const t =
        e !== null && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string'
          ? (e as { type: string }).type
          : 'unknown'
      st.byType[t] = (st.byType[t] ?? 0) + 1
      opts.logEvent(e)
      opts.onEvent(e)
    })

    sock.addEventListener('error', () => {
      console.warn('[blur] socket error')
    })

    sock.addEventListener('close', (ev) => {
      st.connected = false
      if (stopped) return
      const delay = Math.min(5000, 250 * 2 ** Math.min(5, attempts++))
      console.warn(`[blur] closed (${ev.code}) — reconnect in ${delay}ms`)
      timer = setTimeout(connect, delay)
    })
  }

  connect()

  return {
    state: () => st,
    freshnessMs: () => (st.lastFrameAt === 0 ? Infinity : Date.now() - st.lastFrameAt),
    setFilter: (f) => {
      // filter fields are top-level in the message, not wrapped
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(f))
      }
    },
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      try {
        ws?.close()
      } catch {
        /* already closed */
      }
    },
  }
}

import Yellowstone from '@triton-one/yellowstone-grpc'
import type { ClientDuplexStream, SubscribeRequest, SubscribeUpdate } from '@triton-one/yellowstone-grpc'

/**
 * Yellowstone gRPC — the firehose. One stream:
 *   - slots subscription always on (header freshness + reconnect demo)
 *   - filtered transactions added only for pools crossing DEEP_DIVE_THRESHOLD
 *     (filters fully replace per request, so this never widens bandwidth)
 *
 * On reconnect the request carries `fromSlot = lastSeen + 1` so the server
 * replays whatever we missed — slot replay closes the gap, zero missed pools.
 */

const ClientCtor: new (
  endpoint: string,
  xToken?: string,
  channelOptions?: unknown,
  reconnectOptions?: unknown,
) => {
  connect(): Promise<void>
  subscribe(req?: SubscribeRequest): Promise<ClientDuplexStream>
  subscribeReplayInfo(): Promise<unknown>
} = ((Yellowstone as unknown as { default?: unknown }).default ?? Yellowstone) as never

export interface GrpcStats {
  connected: boolean
  connects: number
  reconnects: number
  lastSlot: number
  slotUpdates: number
  txUpdates: number
  /** current replay window start (null once caught up) */
  replayFrom: number | null
  /** last replay window used — survives catch-up, for the demo report */
  lastReplayFrom: number | null
  replayed: number
  givingUp: boolean
  /** server keepalive round-trips completed (stream health) */
  pongs: number
}

export interface GrpcHandle {
  stats(): GrpcStats
  /** replace tx filters (empty array = slots only) */
  setTxAccounts(accounts: string[]): void
  /** force a disconnect — used by the reconnect/slot-replay demo */
  drop(): void
  /** server-side replay window, if supported (null otherwise) */
  replayInfo(): Promise<unknown>
  stop(): void
}

export interface GrpcOpts {
  endpoint: string
  token: string
  onSlot?: (slot: number) => void
  autoReconnect?: boolean
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function startGrpc(opts: GrpcOpts): GrpcHandle {
  let client: InstanceType<typeof ClientCtor> | null = null
  let stream: ClientDuplexStream | null = null
  let txAccounts: string[] = []
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  // replay bookkeeping
  let replayFrom: number | null = null
  let replayed = 0
  let dropBase = 0
  let dropAt = 0

  let pingId = 0 // our own id; server echoes it back in pong

  const st: GrpcStats = {
    connected: false,
    connects: 0,
    reconnects: 0,
    lastSlot: 0,
    slotUpdates: 0,
    txUpdates: 0,
    replayFrom: null,
    lastReplayFrom: null,
    replayed: 0,
    givingUp: false,
    pongs: 0,
  }

  function buildRequest(fromSlot?: number): SubscribeRequest {
    const req: SubscribeRequest = {
      accounts: {},
      slots: { pl: {} },
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      accountsDataSlice: [],
    }
    if (txAccounts.length > 0) {
      req.transactions = {
        pl: {
          vote: false,
          failed: false,
          accountInclude: [...txAccounts],
          accountExclude: [],
          accountRequired: [],
        },
      }
    }
    if (fromSlot !== undefined) req.fromSlot = String(fromSlot)
    return req
  }

  function onData(upd: SubscribeUpdate): void {
    if (upd.slot) {
      const s = Number(upd.slot.slot)
      if (!Number.isFinite(s) || s <= 0) return
      st.slotUpdates++
      if (replayFrom !== null) {
        // estimate the live head while we were down (~400ms slots) to count
        // which updates were genuinely backfilled vs. fresh head data
        const est = dropBase + Math.floor((Date.now() - dropAt) / 400) + 3
        if (s <= est) replayed++
        else replayFrom = null // caught up
        st.replayFrom = replayFrom
        st.replayed = replayed
      }
      if (s > st.lastSlot) st.lastSlot = s
      opts.onSlot?.(s)
      return
    }
    if (upd.transaction) {
      st.txUpdates++
      return
    }
    // Server keepalive: empty ping every ~15s. Reply with a full
    // SubscribeRequest (a request wholly replaces the subscription, so we
    // re-send current filters) carrying ping{id}; server echoes pong{id}.
    if (upd.ping && stream) {
      try {
        const reply = buildRequest()
        reply.ping = { id: ++pingId }
        stream.write(reply)
      } catch {
        /* stream already closing */
      }
      return
    }
    if (upd.pong) {
      st.pongs++
    }
  }

  function scheduleReconnect(): void {
    if (stopped || timer) return
    if (opts.autoReconnect === false) return
    if (st.reconnects >= 4 && st.slotUpdates === 0) {
      st.givingUp = true
      console.warn('[grpc] giving up after 4 attempts with no data — check GRPC endpoint/key')
      return
    }
    st.reconnects++
    dropAt = Date.now()
    if (st.lastSlot > 0 && replayFrom === null) {
      dropBase = st.lastSlot
      replayFrom = st.lastSlot + 1
      st.replayFrom = replayFrom
      st.lastReplayFrom = replayFrom
    }
    const delay = Math.min(5000, 300 * 2 ** Math.min(4, st.reconnects))
    console.warn(`[grpc] stream down — reconnect + fromSlot=${replayFrom ?? 'head'} in ${delay}ms`)
    timer = setTimeout(() => {
      timer = null
      void connectOnce(replayFrom ?? undefined)
    }, delay)
  }

  async function connectOnce(fromSlot?: number): Promise<void> {
    if (stopped) return
    const c = new ClientCtor(opts.endpoint, opts.token || undefined, undefined, { enabled: false })
    let s: ClientDuplexStream | null = null
    let dead = false
    try {
      await c.connect()
      s = await c.subscribe(buildRequest(fromSlot))
    } catch (e) {
      console.warn('[grpc] connect failed:', e instanceof Error ? e.message : String(e))
      if (st.slotUpdates === 0) st.reconnects++ // count boot attempts too
      scheduleReconnect()
      return
    }
    client = c
    stream = s
    st.connected = true
    st.connects++
    if (fromSlot !== undefined) {
      console.info(`[grpc] connected — replaying from slot ${fromSlot}`)
    } else {
      console.info('[grpc] connected')
    }

    const die = (): void => {
      if (dead) return
      dead = true
      st.connected = false
      try {
        s?.destroy()
      } catch {
        /* already gone */
      }
      if (client === c) {
        client = null
        stream = null
      }
      if (!stopped) scheduleReconnect()
    }

    s.on('data', onData)
    s.on('error', (e: Error) => {
      console.warn('[grpc] stream error:', e.message)
      die()
    })
    s.on('close', die)
  }

  void connectOnce()

  return {
    stats: () => st,
    setTxAccounts: (accounts) => {
      txAccounts = accounts
      if (stream && st.connected) {
        try {
          stream.write(buildRequest())
          console.info(
            `[grpc] deep-dive filter → ${accounts.length ? accounts.join(', ') : 'slots only'}`,
          )
        } catch {
          /* stream died between check and write */
        }
      }
    },
    drop: () => {
      stream?.destroy()
      client = null
    },
    replayInfo: async () => {
      if (!client) return null
      try {
        return await client.subscribeReplayInfo()
      } catch {
        return null
      }
    },
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      try {
        stream?.destroy()
      } catch {
        /* noop */
      }
      client = null
      stream = null
    },
  }
}

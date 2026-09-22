import { writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs'
import { log } from './log.ts'
import { config } from './config.ts'
import { conviction, stateFor, type Score, type PoolStateName } from './score.ts'

/** Rolling window kept per pool (events older than this are pruned). */
const WINDOW_MS = 90_000
/** Hard cap on stored recs per pool. */
const MAX_LEN = 1200

export interface SwapRec {
  t: number // local receipt, ms
  side: 'buy' | 'sell'
  vol: number // USD
  price: number // USD per token (0 = unknown)
  trader: string
}

export interface LiqRec {
  t: number
  usd: number
}

export interface TraderRec {
  t: number
  addr: string
}

export interface PoolState {
  pool: string
  mint: string
  dex: string
  name: string
  symbol: string
  creator: string
  createdAt: number // ms, earliest block_time seen (0 = unknown)
  firstSeen: number // ms, local receipt of first event
  liqUsd: number | null
  progressPct: number | null
  graduated: boolean
  surgeMultiple: number | null
  swaps: SwapRec[]
  liqAdds: LiqRec[]
  traderRecs: TraderRec[]
  lastSwapAt: number // ms, for alert latency
}

export interface PoolRow {
  key: string
  pool: string
  mint: string
  dex: string
  label: string
  ageSec: number
  liqUsd: number | null
  vol60: number
  w10: number
  buyRatio: number
  trades60: number
  liqAdded60: number
  progressPct: number | null
  score: Score
  state: PoolStateName
  /** last known swap price (USD, 0 = unknown) */
  price: number
  /** chronological swap prices for the detail-pane sparkline (≤60) */
  prices: { t: number; p: number }[]
  /** local ms receipt of the pool's most recent swap (alert latency base) */
  lastSwapAt: number
  /** newest-first recent swaps for the detail pane */
  swaps: SwapRec[]
}

function num(v: unknown, d = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

function blockMs(e: Record<string, unknown>): number {
  const bt = num(e.block_time, 0)
  return bt > 0 ? bt * 1000 : 0
}

export class Registry {
  pools = new Map<string, PoolState>()
  mintIndex = new Map<string, Set<string>>()

  private ensure(key: string, e: Record<string, unknown>, now: number): PoolState {
    let p = this.pools.get(key)
    if (!p) {
      p = {
        pool: key,
        mint: String(e.mint ?? e.base_mint ?? ''),
        dex: String(e.dex ?? e.launchpad ?? ''),
        name: '',
        symbol: '',
        creator: String(e.creator ?? ''),
        createdAt: 0,
        firstSeen: now,
        liqUsd: null,
        progressPct: null,
        graduated: false,
        surgeMultiple: null,
        swaps: [],
        liqAdds: [],
        traderRecs: [],
        lastSwapAt: 0,
      }
      this.pools.set(key, p)
    }
    if (!p.mint) {
      const mint = String(e.mint ?? e.base_mint ?? '')
      if (mint) {
        p.mint = mint
        this.indexMint(mint, key)
      }
    }
    if (!p.dex) p.dex = String(e.dex ?? e.launchpad ?? '')
    if (!p.creator) p.creator = String(e.creator ?? '')
    const bt = blockMs(e)
    if (bt && (!p.createdAt || bt < p.createdAt)) p.createdAt = bt
    return p
  }

  private indexMint(mint: string, key: string): void {
    let set = this.mintIndex.get(mint)
    if (!set) {
      set = new Set()
      this.mintIndex.set(mint, set)
    }
    set.add(key)
  }

  private byMint(mint: unknown): PoolState[] {
    if (typeof mint !== 'string' || !mint) return []
    const keys = this.mintIndex.get(mint)
    if (!keys) return []
    const out: PoolState[] = []
    for (const k of keys) {
      const p = this.pools.get(k)
      if (p) out.push(p)
    }
    return out
  }

  ingest(raw: unknown): void {
    if (raw === null || typeof raw !== 'object') return
    const e = raw as Record<string, unknown>
    const now = Date.now()

    switch (e.type) {
      case 'pool_create': {
        const key = String(e.pool ?? '')
        if (key) this.ensure(key, e, now)
        break
      }

      case 'token_create': {
        const mint = String(e.mint ?? '')
        const pool = String(e.pool ?? '')
        if (pool) this.ensure(pool, e, now)
        if (mint && pool) this.indexMint(mint, pool)
        for (const p of this.byMint(mint)) {
          if (!p.name) p.name = String(e.name ?? '')
          if (!p.symbol) p.symbol = String(e.symbol ?? '')
          if (!p.creator) p.creator = String(e.creator ?? '')
        }
        break
      }

      case 'swap': {
        const key = String(e.pool ?? '')
        if (!key) break
        const p = this.ensure(key, e, now)
        p.swaps.push({
          t: now,
          side: e.side === 'sell' ? 'sell' : 'buy',
          vol: num(e.volume_usd),
          price: num(e.price_usd),
          trader: String(e.trader ?? ''),
        })
        p.traderRecs.push({ t: now, addr: String(e.trader ?? '') })
        p.lastSwapAt = now
        if (p.swaps.length > MAX_LEN) p.swaps.shift()
        if (p.traderRecs.length > MAX_LEN) p.traderRecs.shift()
        break
      }

      case 'liquidity': {
        if (e.kind === 'remove') break
        const mint = e.mint ?? e.base_mint
        let p: PoolState | undefined
        const key = String(e.pool ?? '')
        if (key) p = this.ensure(key, e, now)
        if (!p) {
          const found = this.byMint(mint)[0]
          if (found) p = found
        }
        if (p) {
          const usd = num(e.volume_usd) || num(e.usd) || num(e.quote_amount_usd)
          p.liqAdds.push({ t: now, usd })
          if (p.liqAdds.length > MAX_LEN) p.liqAdds.shift()
        }
        break
      }

      case 'token_update': {
        const liq = num(e.liquidity_usd, NaN)
        for (const p of this.byMint(e.mint)) {
          if (Number.isFinite(liq)) p.liqUsd = liq
        }
        break
      }

      case 'meme': {
        for (const p of this.byMint(e.mint)) {
          const pct = num(e.progress_pct, NaN)
          if (Number.isFinite(pct)) p.progressPct = pct
          const meta = e.metadata as Record<string, unknown> | undefined
          if (meta) {
            if (!p.symbol && typeof meta.symbol === 'string') p.symbol = meta.symbol
            if (!p.name && typeof meta.name === 'string') p.name = meta.name
          }
        }
        break
      }

      case 'metadata': {
        for (const p of this.byMint(e.mint)) {
          if (!p.name && typeof e.name === 'string') p.name = e.name
          if (!p.symbol && typeof e.symbol === 'string') p.symbol = e.symbol
        }
        break
      }

      case 'graduation': {
        const keys = this.byMint(e.mint)
        const key = String(e.pool ?? '')
        const targets = key && this.pools.has(key) ? [this.pools.get(key)!] : keys
        for (const p of targets) p.graduated = true
        break
      }

      case 'surge':
      case 'radar': {
        const mult = num(e.multiple, NaN)
        for (const p of this.byMint(e.mint)) {
          if (Number.isFinite(mult)) p.surgeMultiple = mult
        }
        break
      }

      default:
        break // stats/candle/etc — already recorded in the JSONL event log
    }
  }

  private prune(p: PoolState, now: number): void {
    const cut = now - WINDOW_MS
    while (p.swaps.length && p.swaps[0].t < cut) p.swaps.shift()
    while (p.liqAdds.length && p.liqAdds[0].t < cut) p.liqAdds.shift()
    while (p.traderRecs.length && p.traderRecs[0].t < cut) p.traderRecs.shift()
  }

  rows(): PoolRow[] {
    const now = Date.now()
    const out: PoolRow[] = []

    for (const [key, p] of this.pools) {
      this.prune(p, now)

      let vol60 = 0
      let buyVol60 = 0
      let trades60 = 0
      let buys = 0
      for (const s of p.swaps) {
        if (now - s.t > 60_000) continue
        trades60++
        vol60 += s.vol
        if (s.side === 'buy') {
          buyVol60 += s.vol
          buys++
        }
      }

      const w10set = new Set<string>()
      for (const tr of p.traderRecs) {
        if (now - tr.t > 10_000) break
        if (tr.addr) w10set.add(tr.addr)
      }

      let liqAdded60 = 0
      for (const l of p.liqAdds) liqAdded60 += l.usd

      const buyRatio = vol60 > 0 ? buyVol60 / vol60 : trades60 > 0 ? buys / trades60 : 0

      const score = conviction({
        w10: w10set.size,
        buyRatio,
        trades60,
        vol60,
        liqAdded60,
      })

      const prices: { t: number; p: number }[] = []
      let price = 0
      for (const s of p.swaps) {
        if (s.price > 0) {
          prices.push({ t: s.t, p: s.price })
          price = s.price
        }
      }

      const startedAt = p.createdAt || p.firstSeen
      out.push({
        key,
        pool: p.pool,
        mint: p.mint,
        dex: p.dex,
        label: p.symbol || p.name || (p.mint ? p.mint.slice(0, 4) + '…' + p.mint.slice(-4) : key.slice(0, 6) + '…'),
        ageSec: Math.max(0, Math.round((now - startedAt) / 1000)),
        liqUsd: p.liqUsd,
        vol60,
        w10: w10set.size,
        buyRatio,
        trades60,
        liqAdded60,
        progressPct: p.progressPct,
        score,
        state: stateFor(score.total, config.alertThreshold),
        price,
        prices: prices.slice(-60),
        lastSwapAt: p.lastSwapAt,
        swaps: p.swaps.slice(-10).reverse(),
      })
    }

    out.sort((a, b) => b.score.total - a.score.total)
    return out
  }

  save(): void {
    try {
      const payload = JSON.stringify({ savedAt: Date.now(), pools: [...this.pools.values()] })
      writeFileSync('data/state.tmp', payload)
      renameSync('data/state.tmp', 'data/state.json')
      log.info(`state saved (${this.pools.size} pools)`)
    } catch (e) {
      log.warn('state save failed:', e instanceof Error ? e.message : String(e))
    }
  }

  load(): void {
    try {
      if (!existsSync('data/state.json')) return
      const raw = JSON.parse(readFileSync('data/state.json', 'utf8')) as { pools?: PoolState[] }
      for (const p of raw.pools ?? []) {
        this.pools.set(p.pool, p)
        if (p.mint) this.indexMint(p.mint, p.pool)
      }
      log.info(`state restored (${this.pools.size} pools)`)
    } catch (e) {
      log.warn('state restore skipped:', e instanceof Error ? e.message : String(e))
    }
  }
}

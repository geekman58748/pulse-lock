/**
 * Synthetic dev feed (`--demo`) — fixture events pushed through the EXACT
 * same ingest pipeline as live Blur frames, so scoring/table/alerts can be
 * built and verified without a Solami key. Clearly labeled everywhere.
 * The judged submission runs live mainnet; this never fakes that.
 */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const SYMS = [
  'BONKLET',
  'MOONPIG',
  'FARTCOIN2',
  'GRIND',
  'SNIPER',
  'WIFDOG',
  'PEPEN',
  'GIGA',
  'CHAD',
  'RETARDIO',
]
const DEXES = ['raydium', 'pumpswap', 'meteora_dlmm', 'raydium_clmm']

const key = (len = 44): string => {
  let s = ''
  for (let i = 0; i < len; i++) s += B58[Math.floor(Math.random() * B58.length)]
  return s
}

interface DemoPool {
  pool: string
  mint: string
  sym: string
  dex: string
  hero: boolean
  bias: number
  liq: number
  progress: number
  traders: string[]
}

export interface DemoHandle {
  stop(): void
  emitted: () => number
}

export function startDemo(onEvent: (e: unknown) => void): DemoHandle {
  let n = 0
  const emit = (e: Record<string, unknown>): void => {
    n++
    onEvent(e)
  }
  const sec = (): number => Math.floor(Date.now() / 1000)
  const rnd = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)
  const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

  const pools: DemoPool[] = []
  let symI = 0

  const spawn = (hero = false): DemoPool => {
    const p: DemoPool = {
      pool: key(),
      mint: key(),
      sym: SYMS[symI % SYMS.length] + (symI >= SYMS.length ? String(symI) : ''),
      dex: pick(DEXES),
      hero,
      bias: hero ? 0.86 : rnd(0.35, 0.8),
      liq: rnd(1500, 46000),
      progress: rnd(5, 70),
      traders: Array.from({ length: hero ? 30 : 12 }, () => key()),
    }
    symI++
    emit({ type: 'pool_create', pool: p.pool, base_mint: p.mint, dex: p.dex, block_time: sec() })
    emit({
      type: 'token_create',
      pool: p.pool,
      mint: p.mint,
      symbol: p.sym,
      name: p.sym,
      creator: key(),
      block_time: sec(),
    })
    pools.push(p)
    return p
  }

  // seed world: five ordinary pools + one hero that will cross DEEP on camera
  for (let i = 0; i < 5; i++) spawn(false)
  spawn(true)

  let tick = 0

  const doSwaps = (p: DemoPool, count: number, usdLo: number, usdHi: number): void => {
    // shuffle a trader slice so wallets/10s grows with genuine uniqueness
    const traders = [...p.traders]
    for (let i = traders.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[traders[i], traders[j]] = [traders[j], traders[i]]
    }
    for (let i = 0; i < count; i++) {
      emit({
        type: 'swap',
        pool: p.pool,
        mint: p.mint,
        side: Math.random() < p.bias ? 'buy' : 'sell',
        volume_usd: rnd(usdLo, usdHi).toFixed(2),
        trader: traders[i % traders.length],
        block_time: sec(),
      })
    }
  }

  const step = (): void => {
    tick++

    for (const p of pools) {
      if (p.hero) {
        doSwaps(p, 6, 80, 900)
        p.bias = rnd(0.8, 0.94)
        p.progress = Math.min(99, p.progress + rnd(0.5, 2))
      } else {
        doSwaps(p, Math.floor(rnd(1, 4)), 30, 500)
        p.bias = Math.min(0.92, Math.max(0.2, p.bias + rnd(-0.08, 0.08)))
      }
    }

    // liquidity adds — the +25 signal
    if (tick % 8 === 0) {
      const p = pick(pools)
      const amt = rnd(500, 3000)
      p.liq += amt
      emit({
        type: 'liquidity',
        kind: 'add',
        pool: p.pool,
        mint: p.mint,
        volume_usd: amt.toFixed(2),
        block_time: sec(),
      })
    }

    // keep the Liquidity column alive
    if (tick % 4 === 0) {
      const p = pick(pools)
      emit({
        type: 'token_update',
        mint: p.mint,
        liquidity_usd: Math.round(p.liq).toString(),
        block_time: sec(),
      })
    }

    if (tick % 12 === 0) {
      const p = pick(pools)
      emit({ type: 'meme', mint: p.mint, progress_pct: p.progress.toFixed(1), block_time: sec() })
    }

    if (tick % 45 === 0) {
      const p = pick(pools.filter((x) => !x.hero))
      if (p) emit({ type: 'surge', mint: p.mint, multiple: rnd(3.2, 8).toFixed(1), block_time: sec() })
    }

    // fresh launches keep the AGE column honest
    if (tick % 28 === 0 && pools.length < 14) spawn(false)
  }

  step()
  const iv = setInterval(step, 900)

  return {
    stop: () => clearInterval(iv),
    emitted: () => n,
  }
}

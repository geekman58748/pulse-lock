/**
 * Conviction score (0–100) with a visible breakdown — the explainable-score
 * differentiator. Four weighted signals, each capped, summed, clamped to 100.
 */

export interface ScorePart {
  name: string
  pts: number
  max: number
}

export interface Score {
  total: number
  parts: ScorePart[]
}

export interface Signals {
  /** unique traders seen in the last 10s */
  w10: number
  /** buy volume / total volume over 60s (0–1) */
  buyRatio: number
  /** number of trades in the last 60s (sample size for confidence) */
  trades60: number
  /** USD volume in the last 60s */
  vol60: number
  /** USD liquidity added in the last 60s */
  liqAdded60: number
}

export function conviction(s: Signals): Score {
  // few trades → shrink imbalance/volume votes so one lucky buy can't spike the score
  const conf = Math.min(1, s.trades60 / 6)

  const walletVelocity = Math.min(30, Math.round(s.w10 * 1.2))
  const buyImbalance = Math.round(s.buyRatio * 30 * conf)
  const liqAdded = Math.min(25, Math.round(s.liqAdded60 / 400))
  const volMomentum = Math.min(15, Math.round(s.vol60 / 100))

  const parts: ScorePart[] = [
    { name: 'Unique wallet velocity', pts: walletVelocity, max: 30 },
    { name: 'Buy/sell imbalance', pts: buyImbalance, max: 30 },
    { name: 'Liquidity added 60s', pts: liqAdded, max: 25 },
    { name: 'Volume momentum 60s', pts: volMomentum, max: 15 },
  ]

  const total = Math.min(100, parts.reduce((a, b) => a + b.pts, 0))
  return { total, parts }
}

export const WATCH_THRESHOLD = 55
export type PoolStateName = 'idle' | 'watch' | 'deep'

export function stateFor(total: number, alertThreshold: number): PoolStateName {
  return total >= alertThreshold ? 'deep' : total >= WATCH_THRESHOLD ? 'watch' : 'idle'
}

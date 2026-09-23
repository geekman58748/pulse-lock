import { config } from './config.ts'
import { log } from './log.ts'
import { broadcast } from './telegram.ts'
import { fmtUSD, fmtPct, explorerLinks } from './format.ts'
import type { PoolRow } from './aggregate.ts'

export interface Alert {
  key: string
  label: string
  score: number
  latencyMs: number
  pool: string
  mint: string
  dex: string
  liqUsd: number | null
  vol60: number
  w10: number
  buyRatio: number
  at: number
  /** price at fire / latest known / pct change since the call */
  priceAt: number
  priceNow: number
  pnlPct: number | null
  /** stream freshness (ms) at fire — null in demo / no firehose */
  freshMs: number | null
}

/**
 * Alert quality > quantity: fires once per pool, only on the transition
 * into DEEP (>= ALERT_THRESHOLD), stamped with ms-since-last-event latency.
 */
export class Alerter {
  list: Alert[] = []
  private fired = new Set<string>()

  maybeFire(row: PoolRow, freshMs: number | null = null): boolean {
    if (this.fired.has(row.key)) return false
    this.fired.add(row.key)
    const a: Alert = {
      key: row.key,
      label: row.label,
      score: row.score.total,
      latencyMs: row.lastSwapAt > 0 ? Math.max(0, Date.now() - row.lastSwapAt) : 0,
      pool: row.pool,
      mint: row.mint,
      dex: row.dex,
      liqUsd: row.liqUsd,
      vol60: row.vol60,
      w10: row.w10,
      buyRatio: row.buyRatio,
      at: Date.now(),
      priceAt: row.price,
      priceNow: row.price,
      pnlPct: null,
      freshMs,
    }
    this.list.unshift(a)
    if (this.list.length > 8) this.list.pop()
    log.info(
      `ALERT ${a.label} score=${a.score} fired ${a.latencyMs}ms after event · pool ${a.pool}` +
        ` · act ${explorerLinks(a.mint)[0]?.url ?? 'n/a'}`,
    )
    void this.deliver(a)
    return true
  }

  private line(a: Alert): string {
    const links = explorerLinks(a.mint)
    return (
      `▲ HIGH CONVICTION ${a.score} — $${a.label} (${a.dex})\n` +
      `liq ${fmtUSD(a.liqUsd)} · 1m vol ${fmtUSD(a.vol60)} · ` +
      `wallets/10s ${a.w10} · buy ${fmtPct(a.buyRatio)}\n` +
      `fired ${a.latencyMs}ms after event\n` +
      `ACT → ` + links.map((l) => `${l.label}: ${l.url}`).join(' · ')
    )
  }

  private async deliver(a: Alert): Promise<void> {
    const text = this.line(a)
    const post = async (label: string, url: string, body: unknown): Promise<void> => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!r.ok) log.warn(`${label} webhook ${r.status}`)
      } catch (e) {
        log.warn(`${label} webhook failed:`, e instanceof Error ? e.message : String(e))
      }
    }
    if (config.discordWebhook) {
      await post('discord', config.discordWebhook, { content: text })
    }
    // self-serve subscribers (anyone who tapped START on the bot) + optional
    // TELEGRAM_CHAT_ID bootstrap — no manual chat-id wiring per user
    await broadcast(text)
  }
}

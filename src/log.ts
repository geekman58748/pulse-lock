import { createWriteStream, mkdirSync } from 'node:fs'
import type { WriteStream } from 'node:fs'

const ts = (): string => new Date().toISOString()

export const log = {
  info: (...a: unknown[]): void => console.log(`[${ts()}]`, ...a),
  warn: (...a: unknown[]): void => console.warn(`[${ts()}] WARN`, ...a),
  error: (...a: unknown[]): void => console.error(`[${ts()}] ERROR`, ...a),
}

/** Every decoded Blur event, appended to data/events-YYYY-MM-DD.jsonl */
class EventLog {
  stream: WriteStream | null = null
  counts: Record<string, number> = {}
  total = 0
  file = ''

  constructor() {
    try {
      mkdirSync('data', { recursive: true })
      const demo = process.argv.includes('--demo') || process.env.DEMO === '1'
      this.file = `data/events${demo ? '-DEMO' : ''}-${new Date().toISOString().slice(0, 10)}.jsonl`
      this.stream = createWriteStream(this.file, { flags: 'a' })
      this.stream.on('error', (e) => {
        log.warn('event log error:', e.message)
        this.stream = null
      })
    } catch (e) {
      log.warn('event log disabled:', e instanceof Error ? e.message : String(e))
    }
  }

  write(e: unknown): void {
    this.total++
    const t =
      e !== null && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string'
        ? (e as { type: string }).type
        : 'unknown'
    this.counts[t] = (this.counts[t] ?? 0) + 1
    this.stream?.write(JSON.stringify(e) + '\n')
  }

  close(): void {
    this.stream?.end()
  }
}

export const events = new EventLog()

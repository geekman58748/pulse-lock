import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { config } from './config.ts'
import { log } from './log.ts'

/**
 * Self-serve Telegram subscriptions — the flow judges use:
 *   dashboard CTA → t.me/<bot> → tap START → poll loop registers the chat
 *   (≤25s) → welcome message → every alert broadcasts to ALL subscribers.
 * No manual chat ids. TELEGRAM_CHAT_ID is only an optional bootstrap.
 */

const STATE = 'data/subscribers.json'
const api = (m: string): string => `https://api.telegram.org/bot${config.telegramToken}/${m}`

const chats = new Set<number>()

const err = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function load(): void {
  try {
    if (existsSync(STATE)) {
      for (const id of JSON.parse(readFileSync(STATE, 'utf8')) as number[]) chats.add(id)
    }
  } catch {
    /* fresh start — corrupt/missing state is not fatal */
  }
  const boot = Number(config.telegramChat)
  if (Number.isFinite(boot) && boot > 0) chats.add(boot)
}

function save(): void {
  try {
    writeFileSync(STATE, JSON.stringify([...chats]))
  } catch (e) {
    log.warn('telegram: subscriber save failed:', err(e))
  }
}

async function post(method: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(api(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) return true
    log.warn(`telegram: ${method} → HTTP ${r.status}`)
    return false
  } catch (e) {
    log.warn(`telegram: ${method} failed:`, err(e))
    return false
  }
}

export const subscriberCount = (): number => chats.size

/** Send one message to every subscriber; prune chats that reject (bot blocked). */
export async function broadcast(text: string): Promise<void> {
  if (!config.telegramToken || chats.size === 0) return
  for (const id of [...chats]) {
    const ok = await post('sendMessage', { chat_id: id, text, disable_web_page_preview: true })
    if (!ok) {
      chats.delete(id)
      log.info(`telegram: pruned subscriber ${id}`)
    }
  }
  save()
}

/** Arm the long-poll loop: auto-register any chat that /starts the bot. */
export function startTelegramPoll(): void {
  if (!config.telegramToken) return
  load()
  log.info(`telegram: subscriber poll armed (${chats.size} known)`)
  void (async () => {
    for (;;) {
      try {
        const r = await fetch(api('getUpdates') + '?timeout=25', {
          signal: AbortSignal.timeout(30_000),
        })
        const j = (await r.json()) as {
          ok?: boolean
          result?: { message?: { from?: { first_name?: string }; chat?: { id?: number } } }[]
        }
        for (const u of j.result ?? []) {
          const id = u.message?.chat?.id
          if (id && !chats.has(id)) {
            chats.add(id)
            save()
            log.info(
              `telegram: new subscriber ${id}${u.message?.from?.first_name ? ` (${u.message.from.first_name})` : ''}`,
            )
            void post('sendMessage', {
              chat_id: id,
              text: "⚡ You're subscribed — PulseLock high-conviction alerts land here. Alarm → metrics → one tap to Photon.",
              disable_web_page_preview: true,
            })
          }
        }
      } catch {
        await sleep(8000) // offline / Telegram hiccup — back off, keep trying
      }
      await sleep(1200)
    }
  })()
}

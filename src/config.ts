import { log } from './log.ts'

function loadDotEnv(): void {
  try {
    process.loadEnvFile()
  } catch {
    /* no .env yet — env vars may come from the shell */
  }
}
loadDotEnv()

function num(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  apiKey: process.env.SOLAMI_API_KEY ?? '',
  wsEndpoint: process.env.SOLAMI_WS_ENDPOINT ?? 'wss://ws.solami.dev/data/subscribe',
  grpcEndpoint: process.env.SOLAMI_GRPC_ENDPOINT ?? 'https://grpc.solami.dev',
  grpcToken: process.env.SOLAMI_GRPC_TOKEN ?? process.env.SOLAMI_API_KEY ?? '',
  discordWebhook: process.env.DISCORD_WEBHOOK_URL ?? '',
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChat: process.env.TELEGRAM_CHAT_ID ?? '',
  telegramUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
  minLiquidityUsd: num(process.env.MIN_LIQUIDITY_USD, 2000),
  deepDiveThreshold: num(process.env.DEEP_DIVE_THRESHOLD, 60),
  alertThreshold: num(process.env.ALERT_THRESHOLD, 75),
  // default OFF for release: live logging wrote 3.5GB of jsonl in one day.
  // Set LOG_EVENTS=1 to capture the raw event stream to data/events-*.jsonl
  logEvents: (process.env.LOG_EVENTS ?? '0') !== '0',
}

export const SIGNUP_URL = 'https://solami.dev/signup?ref=st-earn-sep-26'

export function requireKey(): string {
  if (!config.apiKey) {
    console.error('\n  SOLAMI_API_KEY is missing.')
    console.error(`  Get a free Pro key (7 days): ${SIGNUP_URL}`)
    console.error('  Then: cp .env.example .env  and paste the key.\n')
    process.exit(1)
  }
  return config.apiKey
}

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export { log }

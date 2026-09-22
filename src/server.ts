import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from './log.ts'
import type { PoolRow } from './aggregate.ts'
import type { Alert } from './alerts.ts'

export interface SnapshotHeader {
  slot: number
  freshnessMs: number | null
  firehose: boolean
  deepN: number
  blurReconnects: number
  grpcReconnects: number
  replayed: number
  pongs: number
  gRPCGaveUp: boolean
  events: number
  pools: number
}

export interface Snapshot {
  demo: boolean
  t: number
  /** public Telegram bot username (empty = CTA hidden) */
  telegramBot: string
  header: SnapshotHeader
  pools: PoolRow[]
  alerts: Alert[]
}

export interface WebHandle {
  port: number
  close(): void
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

const PUBLIC_DIR = resolve(fileURLToPath(new URL('../public', import.meta.url)))

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const rel =
    pathname === '/'
      ? '/index.html'
      : pathname === '/app' || pathname === '/terminal'
        ? '/app.html'
        : pathname
  let decoded: string
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    res.writeHead(400).end('bad path')
    return
  }
  const target = resolve(PUBLIC_DIR, '.' + decoded)
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + sep)) {
    res.writeHead(403).end('forbidden')
    return
  }
  try {
    const data = await readFile(target)
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
  }
}

function streamSnapshots(res: ServerResponse, getSnapshot: () => Snapshot): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  res.write(': connected\n\n')
  const send = (): void => {
    try {
      res.write(`data: ${JSON.stringify(getSnapshot())}\n\n`)
    } catch {
      /* client went away mid-write; 'close' handler cleans up */
    }
  }
  send()
  const iv = setInterval(send, 1000)
  res.on('close', () => clearInterval(iv))
}

export function startServer(opts: { port: number; getSnapshot: () => Snapshot }): WebHandle {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    if (pathname === '/stream') {
      streamSnapshots(res, opts.getSnapshot)
      return
    }
    if (pathname === '/api/snapshot') {
      const body = JSON.stringify(opts.getSnapshot())
      res.writeHead(200, { 'content-type': 'application/json' }).end(body)
      return
    }
    void serveStatic(pathname, res)
  })

  server.on('error', (e) => log.warn(`web server on :${opts.port} failed:`, e.message))
  server.listen(opts.port, () => {
    log.info(`landing → http://localhost:${opts.port} · terminal → http://localhost:${opts.port}/app`)
  })

  return {
    port: opts.port,
    close: () => {
      try {
        server.closeAllConnections()
        server.close()
      } catch {
        /* already closing */
      }
    },
  }
}

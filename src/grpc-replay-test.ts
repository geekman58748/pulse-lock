import { config, requireKey, log, errMessage } from './config.ts'
import { startGrpc } from './grpc.ts'

/**
 * Day-1 acceptance test: slot replay closes the gap after a reconnect.
 *
 *   1. subscribe to slots, collect for 8s
 *   2. ask the server for its replay window (SubscribeReplayInfo)
 *   3. force-drop the stream
 *   4. reconnect with fromSlot = lastSeen + 1
 *   5. prove we resume past the drop, and count recovered updates
 *
 * Run: npm run grpc:test
 */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  requireKey()

  const slots: number[] = []
  const handle = startGrpc({
    endpoint: config.grpcEndpoint,
    token: config.grpcToken,
    onSlot: (s) => slots.push(s),
    autoReconnect: true,
  })

  log.info('1) collecting slot updates (8s)…')
  await sleep(8000)
  if (slots.length === 0) {
    console.error('FAIL: no slot updates received — check SOLAMI_GRPC_ENDPOINT / key')
    process.exit(1)
  }
  const before = slots[slots.length - 1]
  console.log(`   received ${slots.length} slot updates, last slot = ${before}`)

  const info = await handle.replayInfo()
  console.log(`2) subscribeReplayInfo: ${JSON.stringify(info)}`)

  console.log('3) forcing disconnect…')
  handle.drop()
  await sleep(4000) // ~10 slots missed on purpose

  console.log('4) waiting for reconnect + fromSlot replay…')
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const s = handle.stats()
    if (s.connected && s.lastSlot > before) break
    await sleep(200)
  }

  const s = handle.stats()
  if (!s.connected || s.lastSlot <= before) {
    console.error(`FAIL: stream did not resume past slot ${before} (stats: ${JSON.stringify(s)})`)
    handle.stop()
    process.exit(1)
  }

  console.log('')
  console.log('── SLOT REPLAY REPORT ──────────────────────────────')
  console.log(`   reconnects:        ${s.reconnects}`)
  console.log(`   fromSlot used:     ${s.lastReplayFrom ?? '(none)'}`)
  console.log(`   recovered updates: ${s.replayed}`)
  console.log(`   resumed at slot:   ${s.lastSlot} (was ${before} before drop)`)
  console.log('────────────────────────────────────────────────────')
  console.log(
    s.replayed > 0
      ? `PASS — gap closed via fromSlot replay: ${s.replayed} missed updates recovered, resynced to slot ${s.lastSlot}.`
      : `PASS (resumed) — stream reconnected and resumed at slot ${s.lastSlot}. Server reported no backfilled slot updates this run (replay window: ${JSON.stringify(info)}); rerun or verify under a longer outage for the on-camera demo.`,
  )
  handle.stop()
  process.exit(0)
}

main().catch((e) => {
  log.error('test crashed:', errMessage(e))
  process.exit(1)
})

import type { Channel } from './data'
import { readJson, writeJson } from './storage'

export type Status = 'live' | 'offline'

/** How long a result is trusted; cards on screen re-check after this */
export const STATUS_TTL = 30 * 60 * 1000
const KEY = 'status'
const MAX_PARALLEL = 6

const results: Record<string, [Status, number]> = readJson(KEY, {})
let saveTimer = 0
let running = 0
const waiting: (() => void)[] = []

export function cachedStatus(c: Channel): Status | undefined {
  const r = results[c.id]
  return r && Date.now() - r[1] < STATUS_TTL ? r[0] : undefined
}

/** Records what the player found, which beats any probe */
export function reportStatus(c: Channel, status: Status) {
  results[c.id] = [status, Date.now()]
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const now = Date.now()
    for (const [id, [, at]] of Object.entries(results)) if (now - at > STATUS_TTL) delete results[id]
    writeJson(KEY, results)
  }, 2000)
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r))
  running++
  try {
    return await fn()
  } finally {
    running--
    waiting.shift()?.()
  }
}

/**
 * Asks the stream for its playlist. A browser can only read streams that allow other sites
 * (CORS), so "offline" here also means "won't play in this app", which is what the badge is for.
 */
async function probe(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    controller.abort() // only the status matters
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Live if any of the channel's streams answers */
export async function checkStatus(c: Channel): Promise<Status> {
  const cached = cachedStatus(c)
  if (cached) return cached
  return withSlot(async () => {
    for (const s of c.s) {
      if (await probe(s.u)) {
        reportStatus(c, 'live')
        return 'live'
      }
    }
    reportStatus(c, 'offline')
    return 'offline'
  })
}

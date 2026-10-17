import type { GuideRef } from './data'

export interface Programme {
  title: string
  /** Epoch ms */
  start: number
  stop: number
}

export interface NowNext {
  now?: Programme
  next?: Programme
}

type GuideFile = Record<string, [number, number, string][]>

const files = new Map<string, Promise<GuideFile | null>>()

function loadFile(file: string) {
  let pending = files.get(file)
  if (!pending) {
    pending = fetch(`data/epg/${file.replaceAll('/', '_')}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<GuideFile>) : null))
      .catch(() => null)
    files.set(file, pending)
  }
  return pending
}

export async function schedule(ref: GuideRef): Promise<Programme[]> {
  const file = await loadFile(ref.file)
  return (file?.[ref.id] ?? []).map(([start, stop, title]) => ({ title, start: start * 1000, stop: stop * 1000 }))
}

export function nowNext(list: Programme[], now = Date.now()): NowNext | null {
  const i = list.findIndex((p) => p.stop > now)
  if (i < 0) return null
  const current = list[i].start <= now ? list[i] : undefined
  return { now: current, next: list[current ? i + 1 : i] }
}

export const progress = (p: Programme, now = Date.now()) =>
  Math.min(1, Math.max(0, (now - p.start) / (p.stop - p.start)))

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
export const formatTime = (ms: number) => timeFormat.format(ms)

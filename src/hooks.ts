import type { RefObject } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { guideOf, type Channel } from './data'
import { nowNext, schedule, type NowNext, type Programme } from './epg'
import { cachedStatus, checkStatus, STATUS_TTL, type Status } from './status'

/** True once the element has stayed on screen for [delay] ms; skips items only scrolled past */
export function useSeen(ref: RefObject<Element>, delay = 500): boolean {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    let timer = 0
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer)
      if (entry.isIntersecting) timer = window.setTimeout(() => setSeen(true), delay)
    })
    observer.observe(el)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [seen])
  return seen
}

/** Re-renders every minute so progress bars and Now/Next move */
export function useMinute(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function useStatus(channel: Channel, active: boolean): Status | undefined {
  const [status, setStatus] = useState(() => cachedStatus(channel))
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const run = () => checkStatus(channel).then((s) => !cancelled && setStatus(s))
    run()
    // Cards that stay on screen re-check once the result is stale
    const id = setInterval(run, STATUS_TTL)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [channel.id, active])
  return status
}

export function useSchedule(channel: Channel, active: boolean): Programme[] | null {
  const [list, setList] = useState<Programme[] | null>(null)
  useEffect(() => {
    const ref = guideOf(channel)
    if (!active || !ref) return
    let cancelled = false
    schedule(ref).then((l) => !cancelled && setList(l))
    return () => {
      cancelled = true
    }
  }, [channel.id, active])
  return list
}

export function useNowNext(channel: Channel, active: boolean): NowNext | null {
  const list = useSchedule(channel, active)
  const now = useMinute()
  return list ? nowNext(list, now) : null
}

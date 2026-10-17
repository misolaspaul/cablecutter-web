import { useMemo, useRef, useState } from 'preact/hooks'
import type { Channel } from '../data'
import { formatTime, type Programme } from '../epg'
import { useMinute, useSchedule, useSeen } from '../hooks'
import { MoreOnScroll } from './MoreOnScroll'

const MINUTE = 60_000
const SLOT = 30 * MINUTE
const SLOTS = 12

interface Timeline {
  start: number
  end: number
  pxPerMinute: number
}

const x = (t: Timeline, time: number) =>
  ((Math.min(Math.max(time, t.start), t.end) - t.start) / MINUTE) * t.pxPerMinute

/** Cable-TV style guide: channels down the side, six hours across the top */
export function Guide({ channels, onPlay }: { channels: Channel[]; onPlay: (c: Channel) => void }) {
  const now = useMinute()
  // Starts at the current half hour; fixed so the grid doesn't jump while open
  const timeline = useMemo<Timeline>(() => {
    const start = Math.floor(Date.now() / SLOT) * SLOT
    return { start, end: start + SLOTS * SLOT, pxPerMinute: matchMedia('(min-width: 900px)').matches ? 6 : 4 }
  }, [])
  const [limit, setLimit] = useState(40)
  const width = SLOTS * 30 * timeline.pxPerMinute

  if (channels.length === 0) return <p class="empty">No programme guide for these channels</p>

  return (
    <div class="guide" style={{ '--timeline': `${width}px` }}>
      <div class="guide-head">
        <div class="guide-corner" />
        {Array.from({ length: SLOTS }, (_, i) => (
          <span key={i} style={{ width: `${30 * timeline.pxPerMinute}px` }}>
            {formatTime(timeline.start + i * SLOT)}
          </span>
        ))}
      </div>
      {channels.slice(0, limit).map((c) => (
        <GuideRow key={c.id} channel={c} timeline={timeline} now={now} onPlay={onPlay} />
      ))}
      {limit < channels.length && <MoreOnScroll onMore={() => setLimit((l) => l + 40)} />}
    </div>
  )
}

function GuideRow({
  channel,
  timeline,
  now,
  onPlay,
}: {
  channel: Channel
  timeline: Timeline
  now: number
  onPlay: (c: Channel) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useSeen(ref, 200)
  const list = useSchedule(channel, seen)
  const [logoFailed, setLogoFailed] = useState(false)
  const visible = list?.filter((p) => p.stop > timeline.start && p.start < timeline.end)

  return (
    <div class="guide-row" ref={ref}>
      <button class="guide-channel" onClick={() => onPlay(channel)}>
        {channel.l && !logoFailed && <img src={channel.l} alt="" loading="lazy" onError={() => setLogoFailed(true)} />}
        <span>{channel.n}</span>
      </button>
      <div class="guide-timeline">
        {visible?.length === 0 && <span class="guide-none">No programme information</span>}
        {visible?.map((p) => (
          <ProgrammeCell key={p.start} programme={p} timeline={timeline} now={now} onClick={() => onPlay(channel)} />
        ))}
        {now >= timeline.start && now < timeline.end && <span class="guide-now" style={{ left: `${x(timeline, now)}px` }} />}
      </div>
    </div>
  )
}

function ProgrammeCell({
  programme,
  timeline,
  now,
  onClick,
}: {
  programme: Programme
  timeline: Timeline
  now: number
  onClick: () => void
}) {
  const left = x(timeline, programme.start)
  const isNow = now >= programme.start && now < programme.stop
  return (
    <button
      class={`programme${isNow ? ' now' : ''}`}
      // 2px short of the next programme, for a gap between cells
      style={{ left: `${left}px`, width: `${Math.max(0, x(timeline, programme.stop) - left - 2)}px` }}
      onClick={onClick}
    >
      <span class="programme-text">
        <span class="programme-title">{programme.title}</span>
        <span class="programme-time">
          {formatTime(programme.start)} – {formatTime(programme.stop)}
        </span>
      </span>
    </button>
  )
}

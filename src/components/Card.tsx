import { useRef, useState } from 'preact/hooks'
import { isGeoBlocked, type Channel } from '../data'
import { formatTime, progress } from '../epg'
import { useNowNext, useSeen, useStatus } from '../hooks'

const LONG_PRESS_MS = 550

interface CardProps {
  channel: Channel
  favorite: boolean
  onPlay: (c: Channel) => void
  onToggleFavorite: (c: Channel) => void
}

/** Holding a card (or right-clicking it) toggles the favorite instead of playing */
function useLongPress(onLongPress: () => void, onClick: () => void) {
  const timer = useRef(0)
  const fired = useRef(false)
  const cancel = () => clearTimeout(timer.current)
  return {
    onPointerDown: () => {
      fired.current = false
      timer.current = window.setTimeout(() => {
        fired.current = true
        onLongPress()
      }, LONG_PRESS_MS)
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: Event) => {
      e.preventDefault()
      if (!fired.current) onLongPress()
      fired.current = true
    },
    onClick: () => {
      if (!fired.current) onClick()
      fired.current = false
    },
  }
}

export function Card({ channel, favorite, onPlay, onToggleFavorite }: CardProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const seen = useSeen(ref)
  const status = useStatus(channel, seen)
  const nowNext = useNowNext(channel, seen)
  const [logoFailed, setLogoFailed] = useState(false)
  const press = useLongPress(
    () => onToggleFavorite(channel),
    () => onPlay(channel),
  )
  const best = channel.s[0]
  const meta = [
    [best.f, best.a].filter(Boolean).join(' '),
    best.lg?.slice(0, 2).join(', '),
    isGeoBlocked(channel) ? 'Geo-blocked' : '',
  ].filter(Boolean)

  return (
    <button ref={ref} class="card" {...press}>
      <div class="thumb">
        {channel.l && !logoFailed ? (
          <img src={channel.l} alt="" loading="lazy" decoding="async" onError={() => setLogoFailed(true)} />
        ) : (
          <span class="initials">{channel.n.slice(0, 2).toUpperCase()}</span>
        )}
        {status && <span class={`badge status ${status}`}>{status === 'live' ? 'LIVE' : 'OFFLINE'}</span>}
        {favorite && (
          <svg class="fav" viewBox="0 0 24 24" aria-label="Favorite">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        )}
        {best.q && <span class="badge quality">{best.q}</span>}
        {nowNext?.now && (
          <span class="progress">
            <span style={{ width: `${progress(nowNext.now) * 100}%` }} />
          </span>
        )}
      </div>
      <span class="title">{channel.n}</span>
      {nowNext?.now && <span class="line">Now: {nowNext.now.title}</span>}
      {nowNext?.next && (
        <span class="line muted">
          Next: {nowNext.next.title} · {formatTime(nowNext.next.start)}
        </span>
      )}
      {meta.length > 0 && <span class="line muted">{meta.join(' · ')}</span>}
    </button>
  )
}

export function SeeAllCard({ onClick }: { onClick: () => void }) {
  return (
    <button class="card" onClick={onClick}>
      <div class="thumb see-all">See all →</div>
    </button>
  )
}

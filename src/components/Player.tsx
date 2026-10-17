import { useEffect, useRef, useState } from 'preact/hooks'
import type { Channel } from '../data'
import { formatTime, progress } from '../epg'
import { useNowNext } from '../hooks'
import { reportStatus } from '../status'
import { Icon } from './Icon'

interface PlayerProps {
  channel: Channel
  favorite: boolean
  captionsOn: boolean
  onCaptionsChange: (on: boolean) => void
  onToggleFavorite: () => void
  onClose: () => void
}

const HIDE_AFTER_MS = 3500

export function Player({ channel, favorite, captionsOn, onCaptionsChange, onToggleFavorite, onClose }: PlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasCaptions, setHasCaptions] = useState(false)
  const [chrome, setChrome] = useState(true)
  // Locked: taps and Back are ignored so kids can't pause or leave
  const [locked, setLocked] = useState(false)
  const [showUnlock, setShowUnlock] = useState(false)
  const lockedRef = useRef(false)
  lockedRef.current = locked
  const nowNext = useNowNext(channel, true)

  // Playback: Safari's native HLS on Apple devices, hls.js elsewhere
  useEffect(() => {
    const el = video.current!
    let hls: import('hls.js').default | undefined
    let index = 0
    let cancelled = false
    // Safari's own HLS handles captions and is required on older iPhones. Chrome has native HLS
    // now too, but without subtitles, so it gets hls.js
    const native = /Apple/.test(navigator.vendor) && el.canPlayType('application/vnd.apple.mpegurl') !== ''

    const failed = (detail?: string) => {
      if (cancelled) return
      // Try the channel's other streams before giving up
      if (index < channel.s.length - 1) return play(index + 1)
      reportStatus(channel, 'offline')
      setError(detail ? `Stream unavailable\n${detail}` : 'Stream unavailable')
    }

    async function play(i: number) {
      index = i
      hls?.destroy()
      hls = undefined
      const url = channel.s[i].u
      if (native || !url.includes('.m3u8')) {
        el.src = url
      } else {
        const { default: Hls } = await import('hls.js')
        if (cancelled) return
        if (!Hls.isSupported()) {
          el.src = url
        } else {
          hls = new Hls()
          hls.on(Hls.Events.ERROR, (_, data) => data.fatal && failed(data.details))
          hls.loadSource(url)
          hls.attachMedia(el)
        }
      }
      el.play().catch(() => {
        // Autoplay can be refused; the play button in the controls still works
      })
    }

    const onError = () => !hls && failed(el.error?.message)
    const onPlaying = () => {
      // Also covers pressing play again after an error
      setError(null)
      reportStatus(channel, 'live')
    }
    el.addEventListener('error', onError)
    el.addEventListener('playing', onPlaying)
    play(0)
    return () => {
      cancelled = true
      el.removeEventListener('error', onError)
      el.removeEventListener('playing', onPlaying)
      hls?.destroy()
      el.removeAttribute('src')
      el.load()
    }
  }, [channel.id])

  // Captions: subtitle files win over captions embedded in the video
  useEffect(() => {
    const tracks = video.current!.textTracks
    const update = () => {
      const list = [...tracks].filter((t) => t.kind === 'subtitles' || t.kind === 'captions')
      setHasCaptions(list.length > 0)
      const preferred = list.find((t) => t.kind === 'subtitles') ?? list[0]
      for (const t of list) {
        const mode = captionsOn && t === preferred ? 'showing' : 'disabled'
        if (t.mode !== mode) t.mode = mode
      }
    }
    update()
    tracks.addEventListener('addtrack', update)
    tracks.addEventListener('removetrack', update)
    return () => {
      tracks.removeEventListener('addtrack', update)
      tracks.removeEventListener('removetrack', update)
    }
  }, [channel.id, captionsOn])

  // Back (button, gesture or browser) closes the player, unless it is locked
  useEffect(() => {
    history.pushState({ player: true }, '')
    const onPop = () => {
      if (lockedRef.current) {
        history.pushState({ player: true }, '')
        setShowUnlock(true)
      } else {
        onClose()
      }
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  // The top bar fades after a few seconds without input
  useEffect(() => {
    if (!chrome) return
    const id = setTimeout(() => setChrome(false), HIDE_AFTER_MS)
    return () => clearTimeout(id)
  }, [chrome, captionsOn, favorite])
  useEffect(() => {
    if (!showUnlock) return
    const id = setTimeout(() => setShowUnlock(false), 3000)
    return () => clearTimeout(id)
  }, [showUnlock])

  return (
    <div class="player" onPointerMove={() => !locked && setChrome(true)} onPointerDown={() => !locked && setChrome(true)}>
      <video ref={video} playsInline autoPlay controls={!locked} />
      {chrome && !locked && (
        <div class="player-bar">
          <button class="icon-button" aria-label="Back" onClick={() => history.back()}>
            <Icon name="back" />
          </button>
          <div class="player-info">
            <h2>{channel.n}</h2>
            {nowNext?.now && (
              <>
                <p>
                  Now: {nowNext.now.title} · {formatTime(nowNext.now.start)}–{formatTime(nowNext.now.stop)}
                </p>
                <span class="progress wide">
                  <span style={{ width: `${progress(nowNext.now) * 100}%` }} />
                </span>
              </>
            )}
            {nowNext?.next && (
              <p class="muted">
                Next: {nowNext.next.title} · {formatTime(nowNext.next.start)}
              </p>
            )}
          </div>
          {hasCaptions && (
            <button
              class={`icon-button${captionsOn ? ' on' : ''}`}
              aria-label={captionsOn ? 'Turn captions off' : 'Turn captions on'}
              aria-pressed={captionsOn}
              onClick={() => onCaptionsChange(!captionsOn)}
            >
              <Icon name="cc" />
            </button>
          )}
          <button class="icon-button" aria-label="Lock screen" onClick={() => setLocked(true)}>
            <Icon name="lockOpen" />
          </button>
          <button
            class={`icon-button${favorite ? ' on' : ''}`}
            aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
          >
            <Icon name={favorite ? 'heart' : 'heartOutline'} />
          </button>
        </div>
      )}
      {error && <p class="player-error">{error}</p>}
      {locked && (
        // Swallows every tap; a tap only reveals the unlock button
        <div class="lock-shield" onPointerDown={() => setShowUnlock(true)}>
          {showUnlock && (
            <button
              class="icon-button unlock"
              aria-label="Unlock"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                setLocked(false)
                setShowUnlock(false)
                setChrome(true)
              }}
            >
              <Icon name="lock" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

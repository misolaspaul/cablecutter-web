import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { Card, SeeAllCard } from './components/Card'
import { Guide } from './components/Guide'
import { Icon, Logo } from './components/Icon'
import { MoreOnScroll } from './components/MoreOnScroll'
import { Player } from './components/Player'
import { guideOf, loadCatalog, type Catalog, type Channel } from './data'
import { readJson, writeJson } from './storage'

const HOME = 'home'
const GUIDE = 'guide'
const FAVORITES = 'favorites'
const ROW_SIZE = 20
const MAX_RECENTS = 20

interface Row {
  id: string
  title: string
  channels: Channel[]
  seeAll?: string
}

/** Favorites and history are channel ids, newest first, kept in this browser */
function useIdList(key: string) {
  const [ids, setIds] = useState<string[]>(() => readJson(key, []))
  useEffect(() => writeJson(key, ids), [ids])
  return [ids, setIds] as const
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState(HOME)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [guideView, setGuideView] = useState(() => readJson('guideView', false))
  const [captionsOn, setCaptionsOn] = useState(false)
  const [favoriteIds, setFavoriteIds] = useIdList('favorites')
  const [recentIds, setRecentIds] = useIdList('recents')
  const [playing, setPlaying] = useState<Channel | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    loadCatalog().then(setCatalog, (e) => setLoadError(`Couldn't load channels (${e.message}). Check your connection and try again.`))
  }, [])
  useEffect(load, [])
  useEffect(() => writeJson('guideView', guideView), [guideView])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  const favorites = useMemo(() => favoriteIds.map((id) => catalog?.byId.get(id)).filter((c): c is Channel => !!c), [catalog, favoriteIds])
  const recents = useMemo(() => recentIds.map((id) => catalog?.byId.get(id)).filter((c): c is Channel => !!c), [catalog, recentIds])
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  const chips = useMemo(() => {
    const list = [
      { key: HOME, label: 'Home' },
      { key: GUIDE, label: 'TV Guide' },
    ]
    if (favorites.length) list.push({ key: FAVORITES, label: 'Favorites' })
    for (const c of catalog?.categories ?? []) list.push({ key: c, label: c })
    return list
  }, [catalog, favorites.length])
  // Fall back to Home when e.g. the last favorite was removed
  const tab = chips.some((c) => c.key === selected) ? selected : HOME
  const q = query.trim().toLowerCase()

  const rows = useMemo<Row[]>(() => {
    if (!catalog) return []
    const out: Row[] = []
    if (recents.length) out.push({ id: 'recent', title: 'Continue watching', channels: recents })
    const add = (id: string, title: string, list: Channel[]) =>
      out.push({ id, title, channels: list.slice(0, ROW_SIZE), seeAll: list.length > ROW_SIZE ? id : undefined })
    if (favorites.length) add(FAVORITES, 'Favorites', favorites)
    for (const c of catalog.categories) add(c, c, catalog.byCategory.get(c)!)
    return out
  }, [catalog, recents, favorites])

  const list = useMemo(() => {
    if (!catalog) return []
    if (q) return catalog.channels.filter((c) => c.n.toLowerCase().includes(q))
    if (tab === GUIDE) return [...new Set([...favorites, ...catalog.channels])].filter((c) => guideOf(c))
    const base = tab === FAVORITES ? favorites : (catalog.byCategory.get(tab) ?? [])
    return guideView ? base.filter((c) => guideOf(c)) : base
  }, [catalog, q, tab, favorites, guideView])

  const showGuide = !q && (tab === GUIDE || (guideView && tab !== HOME))

  const play = useCallback((c: Channel) => {
    setRecentIds((ids) => [c.id, ...ids.filter((id) => id !== c.id)].slice(0, MAX_RECENTS))
    setPlaying(c)
  }, [])
  const toggleFavorite = useCallback(
    (c: Channel) => {
      const added = !favoriteIds.includes(c.id)
      setFavoriteIds(added ? [c.id, ...favoriteIds] : favoriteIds.filter((id) => id !== c.id))
      setToast(added ? `Added ${c.n} to favorites` : `Removed ${c.n} from favorites`)
    },
    [favoriteIds],
  )
  const cardProps = (c: Channel) => ({
    channel: c,
    favorite: favoriteSet.has(c.id),
    onPlay: play,
    onToggleFavorite: toggleFavorite,
  })

  return (
    <div class="app">
      <header class="top-bar">
        {searching ? (
          <>
            <button
              class="icon-button"
              aria-label="Close search"
              onClick={() => {
                setSearching(false)
                setQuery('')
              }}
            >
              <Icon name="back" />
            </button>
            <input
              id="search"
              class="search"
              type="search"
              placeholder="Search channels"
              autoFocus
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </>
        ) : (
          <>
            <Logo />
            <h1>CableCutter</h1>
            <button class="icon-button" aria-label="Search" onClick={() => setSearching(true)}>
              <Icon name="search" />
            </button>
          </>
        )}
      </header>

      {!searching && (
        <nav class="chips">
          {chips.map((c) => (
            <button key={c.key} class={`chip${c.key === tab ? ' selected' : ''}`} onClick={() => setSelected(c.key)}>
              {c.label}
            </button>
          ))}
        </nav>
      )}
      {!searching && tab !== HOME && tab !== GUIDE && (
        <label class="guide-toggle">
          <input id="guide-view" type="checkbox" checked={guideView} onChange={(e) => setGuideView(e.currentTarget.checked)} />
          Program guide
        </label>
      )}

      <main class="content">
        {loadError ? (
          <div class="empty">
            <p>{loadError}</p>
            <button class="chip selected" onClick={load}>
              Retry
            </button>
          </div>
        ) : !catalog ? (
          <div class="spinner" role="status" aria-label="Loading channels" />
        ) : showGuide ? (
          <Guide key={tab} channels={list} onPlay={play} />
        ) : tab === HOME && !q ? (
          rows.map((row) => (
            <section key={row.id} class="row">
              <h2>{row.title}</h2>
              <div class="row-scroll">
                {row.channels.map((c) => (
                  <Card key={c.id} {...cardProps(c)} />
                ))}
                {row.seeAll && <SeeAllCard onClick={() => setSelected(row.seeAll!)} />}
              </div>
            </section>
          ))
        ) : (
          <ChannelGrid key={tab + q} channels={list} cardProps={cardProps} />
        )}
      </main>

      {playing && (
        <Player
          key={playing.id}
          channel={playing}
          favorite={favoriteSet.has(playing.id)}
          captionsOn={captionsOn}
          onCaptionsChange={setCaptionsOn}
          onToggleFavorite={() => toggleFavorite(playing)}
          onClose={() => setPlaying(null)}
        />
      )}
      {toast && (
        <div class="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

function ChannelGrid({
  channels,
  cardProps,
}: {
  channels: Channel[]
  cardProps: (c: Channel) => Parameters<typeof Card>[0]
}) {
  const [limit, setLimit] = useState(60)
  if (!channels.length) return <p class="empty">No channels found</p>
  return (
    <div class="grid">
      {channels.slice(0, limit).map((c) => (
        <Card key={c.id} {...cardProps(c)} />
      ))}
      {limit < channels.length && <MoreOnScroll onMore={() => setLimit((l) => l + 60)} />}
    </div>
  )
}

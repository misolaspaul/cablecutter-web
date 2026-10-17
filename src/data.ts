// Channel list built by scripts/build-data.mjs; keys are short to keep the download small

export interface Stream {
  u: string
  /** Quality, e.g. "720p" */
  q?: string
  /** Geo-blocked */
  g?: 1
  /** Broadcast area name, its flag and country code (absent for multi-country regions) */
  a?: string
  f?: string
  ac?: string
  lg?: string[]
  /** Guide file and the channel's id in it */
  gf?: string
  gi?: string
}

export interface Channel {
  id: string
  n: string
  l?: string
  c: string[]
  /** Best first; the player falls back to the next one on error */
  s: Stream[]
}

export interface Catalog {
  channels: Channel[]
  byId: Map<string, Channel>
  /** Biggest first, "Other" last */
  categories: string[]
  byCategory: Map<string, Channel[]>
}

export interface GuideRef {
  file: string
  id: string
}

export const OTHER = 'Other'

export const isGeoBlocked = (c: Channel) => c.s.every((s) => s.g)

export function guideOf(c: Channel): GuideRef | null {
  const s = c.s.find((s) => s.gf && s.gi)
  return s ? { file: s.gf!, id: s.gi! } : null
}

/** The viewer's country, e.g. "US" from "en-US" or the likely region for plain "en" */
function homeCountry(): string {
  try {
    const locale = new Intl.Locale(navigator.languages?.[0] ?? navigator.language).maximize()
    return locale.region ?? 'US'
  } catch {
    return 'US'
  }
}

export async function loadCatalog(): Promise<Catalog> {
  const res = await fetch('data/catalog.json')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { channels } = (await res.json()) as { channels: Channel[] }

  // Channels broadcast to the viewer's country first, then working streams, then by name
  const home = homeCountry()
  const rank = (c: Channel) => (c.s[0].ac === home ? 0 : 2) + (isGeoBlocked(c) ? 1 : 0)
  channels.sort((a, b) => rank(a) - rank(b) || a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }))

  const counts = new Map<string, number>()
  for (const ch of channels) for (const cat of ch.c) counts.set(cat, (counts.get(cat) ?? 0) + 1)
  const categories = [...counts.keys()].sort(
    (a, b) => Number(a === OTHER) - Number(b === OTHER) || counts.get(b)! - counts.get(a)!,
  )
  const byCategory = new Map(categories.map((cat) => [cat, channels.filter((c) => c.c.includes(cat))]))
  return { channels, byId: new Map(channels.map((c) => [c.id, c])), categories, byCategory }
}

// Builds the compact channel list and trimmed programme guides the web app loads.
// Mirrors the Android app's Catalog.build, plus drops streams a browser can't play.
//
//   node scripts/build-data.mjs   ->   public/data/catalog.json, public/data/epg/*.json

import { mkdir, writeFile, rm } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const API = 'https://iptv-org.github.io/api'
const EPG = 'https://i.mjh.nz'
const OUT = new URL('../public/data/', import.meta.url)
const HOUR = 3600
// Guides cover a little of the past and more than the time until the next scheduled build
const EPG_FROM = -2 * HOUR
const EPG_TO = 30 * HOUR

const nameTags = /\s*(\(\d+[pi]\)|\[[^\]]*])/g
const plutoId = /jmp2\.uk\/plu-([0-9a-f]+)/

/** fetch with a few retries; the hosts occasionally drop connections under parallel load */
async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 404 || i === tries) return res
    } catch (e) {
      if (i === tries) throw e
    }
    await new Promise((r) => setTimeout(r, 1000 * i))
  }
}

async function json(name) {
  const res = await get(`${API}/${name}.json`)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`)
  return res.json()
}

/** c/BR -> BR, s/US-NY -> US, ct/USNYC -> US; null for regions */
function countryOf(area) {
  if (area.startsWith('c/')) return area.slice(2)
  if (area.startsWith('s/')) return area.slice(2).split('-')[0]
  if (area.startsWith('ct/')) return area.slice(3, 5)
  return null
}

// iptv-org writes the United Kingdom as UK, Pluto's guide files use the ISO code
const plutoRegion = (code) => (code === 'UK' ? 'gb' : code.toLowerCase())

const resolution = (q) => parseInt(q ?? '', 10) || 0

async function buildCatalog() {
  const [channels, streams, logos, categories, countries, feeds, languages, regions, guides] = await Promise.all(
    ['channels', 'streams', 'logos', 'categories', 'countries', 'feeds', 'languages', 'regions', 'guides'].map(json),
  )
  const channelById = new Map(channels.filter((c) => !c.is_nsfw && !c.closed).map((c) => [c.id, c]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const country = new Map(countries.map((c) => [c.code, c]))
  const regionName = new Map(regions.map((r) => [r.code, r.name]))
  const languageName = new Map(languages.map((l) => [l.code, l.name]))
  const feedByKey = new Map(feeds.map((f) => [`${f.channel}|${f.id}`, f]))
  const mainFeed = new Map(feeds.filter((f) => f.is_main).map((f) => [f.channel, f]))
  const logo = new Map()
  for (const l of [...logos].sort((a, b) => (a.feed ? 1 : 0) - (b.feed ? 1 : 0))) {
    if (l.channel && !logo.has(l.channel)) logo.set(l.channel, l.url)
  }
  const guideByFeed = new Map()
  const guideByChannel = new Map()
  for (const g of guides) {
    if (g.site !== 'i.mjh.nz' || !g.channel || !g.site_id.includes('#')) continue
    const [file, id] = g.site_id.split('#')
    guideByFeed.set(`${g.channel}|${g.feed}`, { file, id })
    guideByChannel.set(g.channel, { file, id })
  }

  // Browsers block http:// video on an https page and can't send custom User-Agent/Referer headers
  const playable = streams.filter((s) => s.url.startsWith('https://') && !s.user_agent && !s.referrer)

  const groups = new Map()
  for (const s of playable) {
    const key = s.channel ?? `url:${s.url}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }

  const out = []
  for (const [id, list] of groups) {
    const meta = list[0].channel ? channelById.get(list[0].channel) : null
    if (list[0].channel && !meta) continue
    const s = list
      .map((st) => {
        const feed = st.channel ? (st.feed && feedByKey.get(`${st.channel}|${st.feed}`)) || mainFeed.get(st.channel) : null
        const areaCode = feed?.broadcast_area?.[0]
        const region = areaCode?.startsWith('r/') ? regionName.get(areaCode.slice(2)) : null
        const c = country.get((areaCode && countryOf(areaCode)) ?? meta?.country)
        const areaCountry = region ? null : c?.code
        const pluto = plutoId.exec(st.url)
        const guide =
          (st.channel && (guideByFeed.get(`${st.channel}|${st.feed}`) ?? guideByChannel.get(st.channel))) ||
          (pluto && areaCountry ? { file: `PlutoTV/${plutoRegion(areaCountry)}`, id: pluto[1] } : null)
        const stream = { u: st.url }
        if (st.quality) stream.q = st.quality
        if (st.labels?.includes('Geo-blocked')) stream.g = 1
        const area = region ?? c?.name
        if (area) stream.a = area
        const flag = region ? '🌐' : c?.flag
        if (flag) stream.f = flag
        if (areaCountry) stream.ac = areaCountry
        const langs = (feed?.languages ?? []).map((l) => languageName.get(l)).filter(Boolean)
        if (langs.length) stream.lg = langs
        if (guide) Object.assign(stream, { gf: guide.file, gi: guide.id })
        return stream
      })
      .sort((a, b) => (a.g ?? 0) - (b.g ?? 0) || resolution(b.q) - resolution(a.q))
    const channel = {
      id,
      n: meta?.name ?? list[0].title.replace(nameTags, '').trim(),
      c: meta?.categories?.map((c) => categoryName.get(c)).filter(Boolean) ?? [],
      s,
    }
    if (!channel.c.length) channel.c = ['Other']
    const l = meta && logo.get(meta.id)
    if (l) channel.l = l
    out.push(channel)
  }
  out.sort((a, b) => a.n.localeCompare(b.n))
  return out
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** "20261017120000 +0000" -> unix seconds */
function xmltvTime(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])(\d{2})(\d{2})/.exec(value)
  if (!m) return NaN
  const [, y, mo, d, h, mi, s, sign, oh, om] = m
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 1000
  return utc - (sign === '+' ? 1 : -1) * (+oh * HOUR + +om * 60)
}

/** Programmes per channel id as [start, stop, title], only for the ids we use */
async function buildGuide(file, ids, now) {
  const res = await get(`${EPG}/${file}.xml.gz`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8')
  const result = {}
  const programme = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g
  for (const [, attrs, body] of xml.matchAll(programme)) {
    const id = decodeEntities(/channel="([^"]*)"/.exec(attrs)?.[1] ?? '')
    if (!ids.has(id)) continue
    const start = xmltvTime(/start="([^"]*)"/.exec(attrs)?.[1] ?? '')
    const stop = xmltvTime(/stop="([^"]*)"/.exec(attrs)?.[1] ?? '')
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1]
    if (!title || !(stop > start) || stop < now + EPG_FROM || start > now + EPG_TO) continue
    ;(result[id] ??= []).push([start, stop, decodeEntities(title).trim()])
  }
  for (const list of Object.values(result)) list.sort((a, b) => a[0] - b[0])
  return result
}

async function mapLimit(items, limit, fn) {
  let next = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await fn(items[next++])
    }),
  )
}

const channels = await buildCatalog()
await rm(OUT, { recursive: true, force: true })
await mkdir(new URL('epg/', OUT), { recursive: true })
await writeFile(new URL('catalog.json', OUT), JSON.stringify({ generated: Date.now(), channels }))
console.log(`catalog: ${channels.length} channels`)

const idsByFile = new Map()
for (const ch of channels) {
  for (const s of ch.s) {
    if (!s.gf) continue
    if (!idsByFile.has(s.gf)) idsByFile.set(s.gf, new Set())
    idsByFile.get(s.gf).add(s.gi)
  }
}
const now = Math.floor(Date.now() / 1000)
let built = 0
await mapLimit([...idsByFile], 6, async ([file, ids]) => {
  try {
    const guide = await buildGuide(file, ids, now)
    await writeFile(new URL(`epg/${file.replaceAll('/', '_')}.json`, OUT), JSON.stringify(guide))
    built++
  } catch (e) {
    // Some region files don't exist; those channels just show no guide
    console.warn(`guide ${file}: ${e.message}`)
  }
})
console.log(`guides: ${built} of ${idsByFile.size} files`)

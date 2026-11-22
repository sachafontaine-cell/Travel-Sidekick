// Representative photos from Wikipedia (Wikimedia Commons): only when the article is clearly
// about this exact place (name matches, and its location is close). Otherwise no photo:
// a missing photo is better than a wrong one. Looked up once, in the background.
import type { Place, Trip } from './model'
import { km } from './geo'

const STOP = new Set(['the', 'and', 'of', 'de', 'del', 'des', 'du', 'la', 'le', 'les', 'los', 'las', 'el', 'lunch', 'dinner', 'highlights', 'tour', 'visit', 'walk', 'at', 'in', 'on', 'a'])
export function words(s: string): string[] {
  return s.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w))
}
const same = (a: string, b: string) => a === b || (a.length > 4 && b.length > 4 && (a.startsWith(b) || b.startsWith(a)))
/**
 * How well an article title names this place (0–1): most of the place's words must be in the
 * title, and the title shouldn't be about something bigger or different ("Carrousel du Louvre"
 * scores lower than "Louvre" for the Louvre).
 */
export function nameMatch(name: string, title: string): number {
  const n = words(name), t = words(title)
  if (!n.length || !t.length) return 0
  const recall = n.filter((w) => t.some((x) => same(w, x))).length / n.length
  const precision = t.filter((x) => n.some((w) => same(w, x))).length / t.length
  if (recall < 0.5) return 0
  return (2 * recall * precision) / (recall + precision)
}

/** Articles about events, lists or transport, not the place itself. */
const NOT_PLACE = /\b(fire|fires|siege|attack|attacks|bombing|riot|riots|battle|massacre|shooting|collapse|disaster|protest|protests|election|history of|list of|station|metro|line \d|restoration|reconstruction|incendie|estaci[oó]n)\b/i
/** A modern photo file (not a drawing, plan, painting, engraving or a pre-1950 picture). */
export function isPhoto(title: string): boolean {
  if (!/\.(jpe?g)$/i.test(title)) return false
  if (/(ortho|aerial|engraving|gravure|drawing|dessin|painting|peinture|lithograph|etching|plan|projet|plaque|sketch|illustration|postcard|carte|vue_g[eé]n[eé]rale|interior_view_of_the_ancient)/i.test(title)) return false
  const years = title.match(/(1[5-9]\d\d|20\d\d)/g)?.map(Number) ?? []
  return !years.some((y) => y < 1950)
}
const BAD = /(^|[_\s\-(.,])(map|logo|plan|diagram|locator|location|flag|coat[_ ]of[_ ]arms|icon|signature|seal|chart|blason)([_\s\-).,]|$)|\.svg$/i
const sized = (src: string, w = 480) => {
  const u = src.startsWith('//') ? 'https:' + src : src
  // Wikimedia thumbnails: …/thumb/x/xy/File.jpg/320px-File.jpg → 480px
  return u.replace(/\/(\d+)px-([^/]+)$/, `/${w}px-$2`)
}

async function json<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url); return r.ok ? ((await r.json()) as T) : null } catch { return null }
}

interface Summary { type?: string; title: string; wikibase_item?: string; coordinates?: { lat: number; lon: number }; thumbnail?: { source: string } }

/** A Commons file as a ~480 px image (the address redirects to the right thumbnail). */
export const commons = (file: string, w = 480) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${w}`

async function photosOf(lang: string, title: string, p: Place): Promise<string[] | null> {
  const s = await json<Summary>(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  if (!s || s.type === 'disambiguation' || NOT_PLACE.test(s.title)) return null
  // The article must be about this place: close by (when it has a location) and the same name.
  if (s.coordinates && km(p, { lat: s.coordinates.lat, lng: s.coordinates.lon }) > 2.5) return null
  if (nameMatch(p.name, s.title) < 0.5) return null
  // The place's official image(s) on Wikidata: the picture editors chose to represent it.
  const urls: string[] = []
  if (s.wikibase_item) {
    const j = await json<{ claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } }>(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${s.wikibase_item}&property=P18&format=json&origin=*`)
    for (const c of j?.claims?.P18 ?? []) {
      const f = c.mainsnak?.datavalue?.value
      if (f && !BAD.test(f) && urls.length < 2) urls.push(commons(f))
    }
  }
  // No official image: the article's main picture, if it's a modern photo.
  if (!urls.length && s.thumbnail?.source) {
    const f = decodeURIComponent(s.thumbnail.source.split('/').pop() ?? '').replace(/^\d+px-/, '').replace(/\?.*$/, '')
    if (isPhoto(f) && !BAD.test(f)) urls.push(sized(s.thumbnail.source))
  }
  return urls
}

/** Articles near the place whose name matches, best first (English, then the local language). */
async function nearby(lang: string, p: Place): Promise<string[]> {
  const j = await json<{ query?: { geosearch?: { title: string; dist: number }[] } }>(`https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${p.lat}|${p.lng}&gsradius=1200&gslimit=100&format=json&origin=*`)
  return (j?.query?.geosearch ?? []).filter((g) => !NOT_PLACE.test(g.title)).map((g) => ({ t: g.title, s: nameMatch(p.name, g.title) - g.dist / 10000 })).filter((x) => x.s >= 0.4).sort((a, b) => b.s - a.s).slice(0, 2).map((x) => x.t)
}

export async function findPhotos(p: Place, trip: Pick<Trip, 'dest'>): Promise<NonNullable<Place['photos']>> {
  const at = Date.now()
  const langs = [...new Set(['en', trip.dest.lang?.split('-')[0] || 'en'])]
  const tries: [string, string][] = p.wiki ? [['en', p.wiki]] : []
  for (const lang of langs) for (const t of await nearby(lang, p)) tries.push([lang, t])
  for (const [lang, title] of tries) {
    const urls = await photosOf(lang, title, p)
    if (urls?.length) return { title, lang, urls, at }
  }
  return { title: '', lang: 'en', urls: [], at }
}

/** Places worth a photo: the ones you'd see on a card soon. Meals and snacks rarely have one. */
export const wantsPhoto = (p: Place) => !p.photos && !p.scoring && p.status !== 'out' && p.kind !== 'meal' && p.kind !== 'other'

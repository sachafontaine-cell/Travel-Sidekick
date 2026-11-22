// Deep search: one Gemini search can't cover a whole destination, so the list is built from
// several focused searches (each searching Google), plus real places near you from OpenStreetMap
// and Wikipedia for Gemini to judge, so well-known places can't be forgotten. All free.
import type { Place, Trip } from './model'
import { km } from './geo'
import { words, nameMatch } from './photos'
import { searchPlaces } from './ai'

export interface Pass { id: string; label: string; focus: string; n: number }

export function passes(trip: Trip, candidates: string[]): Pass[] {
  const kids = trip.people.some((p) => p.age < 13)
  const list: (Pass | false)[] = [
    { id: 'iconic', label: 'Must-sees', focus: 'the must-sees and best-known landmarks, viewpoints and neighbourhoods, plus 1-2 famous tourist traps marked "trap"', n: 10 },
    { id: 'nature', label: 'Beaches & nature', focus: 'beaches, nature, parks, hikes, lookouts and wildlife (where and when to see animals)', n: 8 },
    { id: 'tours', label: 'Tours & activities', focus: 'tours, boat trips, snorkeling or diving, excursions, classes and other activities to book', n: 8 },
    { id: 'dates', label: 'On your dates', focus: 'things that happen only on or around their dates: seasonal wildlife (e.g. sea-turtle hatchling releases, whale migration), festivals, holidays, weekly markets, sports, concerts', n: 8 },
    !!trip.base && { id: 'near', label: 'Near home', focus: `local favourites within 5 km of where they're staying (${trip.base.name}), of any kind, including what locals do`, n: 8 },
    { id: 'museums', label: 'Museums & culture', focus: 'museums, history, art and culture worth it for this group', n: 6 },
    kids && { id: 'kids', label: 'Kids & animals', focus: 'zoos, aquariums, water and theme parks, playgrounds and other things kids love', n: 6 },
    { id: 'food', label: 'Food', focus: '4-6 sit-down meal spots near the sights and 3-4 snacks (ice cream, bakeries, street food) that locals love', n: 9 },
    { id: 'evening', label: 'Evenings & markets', focus: 'shows and evening things suited to this group, shopping and markets', n: 6 },
    candidates.length > 0 && { id: 'map', label: 'Places on the map', focus: `which of these real places near them (from OpenStreetMap and Wikipedia) are worth it for this group; score honestly and leave out the ones that aren't: ${candidates.join('; ')}`, n: 12 },
  ]
  return list.filter((x): x is Pass => !!x)
}

/** Same place? Same words, or close by with a matching name. */
export function isDup(p: Pick<Place, 'name' | 'lat' | 'lng'>, list: Pick<Place, 'name' | 'lat' | 'lng'>[]): boolean {
  const key = words(p.name).join(' ')
  return list.some((x) => (key && words(x.name).join(' ') === key) || (km(p, x) < 0.4 && Math.max(nameMatch(p.name, x.name), nameMatch(x.name, p.name)) >= 0.6))
}

/** Real, named places near the trip: tourism spots and beaches from OpenStreetMap, notable places from Wikipedia. */
export async function nearbyCandidates(trip: Trip): Promise<string[]> {
  const c = trip.base ?? trip.dest
  const out = new Map<string, { name: string; score: number }>()
  const add = (name: string | undefined, score: number) => {
    if (!name || name.length < 3 || name.length > 70) return
    const k = words(name).join(' ')
    if (k && (out.get(k)?.score ?? -1) < score) out.set(k, { name, score })
  }
  const q = `[out:json][timeout:20];(
nwr["tourism"~"^(attraction|museum|viewpoint|zoo|aquarium|theme_park|gallery)$"]["name"](around:20000,${c.lat},${c.lng});
nwr["natural"="beach"]["name"](around:20000,${c.lat},${c.lng});
nwr["leisure"~"^(water_park|nature_reserve|marina)$"]["name"](around:20000,${c.lat},${c.lng});
nwr["historic"]["name"]["wikidata"](around:20000,${c.lat},${c.lng});
);out center tags 400;`
  const osm = fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(25000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] } | null) => {
      for (const e of j?.elements ?? []) {
        const t = e.tags ?? {}
        const pt = e.center ?? (e.lat != null ? { lat: e.lat, lon: e.lon! } : null)
        const near = pt ? Math.max(0, 3 - km(c, { lat: pt.lat, lng: pt.lon }) / 7) : 0
        const notable = (t.wikidata ? 2 : 0) + (t.wikipedia ? 1 : 0)
        const kind = /zoo|aquarium|theme_park|museum/.test(t.tourism ?? '') || t.natural === 'beach' || t.leisure === 'water_park' ? 1 : 0
        add(t['name:en'] ?? t.name, notable + kind + near)
      }
    }).catch(() => {})
  const wiki = fetch(`https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${c.lat}|${c.lng}&gsradius=10000&gslimit=60&format=json&origin=*`, { signal: AbortSignal.timeout(15000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { query?: { geosearch?: { title: string; dist: number }[] } } | null) => {
      for (const g of j?.query?.geosearch ?? []) {
        if (/\b(school|hospital|airport|station|district|municipality|list of|election|church of jesus christ|cemetery|highway|road|street|bridge|hotel)\b/i.test(g.title)) continue
        add(g.title.replace(/\s*\(.*\)$/, ''), 2.5 - g.dist / 5000)
      }
    }).catch(() => {})
  await Promise.all([osm, wiki])
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 60).map((x) => x.name)
}

/**
 * Runs every pass (3 at a time) and streams new places out as they arrive, skipping anything
 * already in `known`. A pass that fails doesn't stop the others; if all fail, it throws.
 */
export async function deepSearch(trip: Trip, known: Pick<Place, 'name' | 'lat' | 'lng'>[], onPlace: (p: Place) => void, onProgress: (done: string[], running: string[], total: number) => void): Promise<number> {
  const seen = [...known]
  const candidates = (await nearbyCandidates(trip)).filter((n) => !seen.some((x) => Math.max(nameMatch(n, x.name), nameMatch(x.name, n)) >= 0.6))
  const all = passes(trip, candidates)
  const done: string[] = [], running: string[] = []
  let added = 0, failed = 0, lastError: unknown
  const queue = [...all]
  const worker = async () => {
    for (let pass = queue.shift(); pass; pass = queue.shift()) {
      running.push(pass.label); onProgress(done, running, all.length)
      try {
        await searchPlaces(trip, pass.focus, pass.n, seen.map((x) => x.name), (p) => {
          if (isDup(p, seen)) return
          seen.push(p); added++; onPlace(p)
        })
      } catch (e) { failed++; lastError = e }
      running.splice(running.indexOf(pass.label), 1); done.push(pass.label); onProgress(done, running, all.length)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  if (failed === all.length) throw lastError instanceof Error ? lastError : new Error('Search failed.')
  return added
}

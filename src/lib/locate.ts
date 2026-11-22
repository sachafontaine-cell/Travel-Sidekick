// Where each place really is. Gemini writes coordinates from memory and is often off, sometimes
// by kilometres; each place is looked up once on Google Maps (through the family script, free)
// or, without the script, on OpenStreetMap. The checked spot replaces the guess.
import { places, save, tripPlaces } from './data'
import { call, connected, syncState } from './sync'
import { km } from './geo'
import type { Place, Trip } from './model'
import { DEMO } from './store'

type Found = { lat?: number; lng?: number; address?: string; exact?: boolean; none?: boolean; error?: string }

const MAX_KM = 120
const asked = new Set<string>()
export const unchecked = (p: Place) => !p.loc && !p.scoring && !p.booked

function apply(trip: Trip, p: Place, f: Found | undefined, src: 'google' | 'osm'): Place | null {
  const cur = places.get()[p.id]
  if (!cur || !f || f.error) return null
  const c = trip.base ?? trip.dest
  if (f.none || f.lat == null || f.lng == null || km(c, { lat: f.lat, lng: f.lng }) > MAX_KM) return src === 'google' ? { ...cur, loc: { src: 'none', at: Date.now() } } : null
  return { ...cur, lat: f.lat, lng: f.lng, loc: { src, exact: f.exact, address: f.address, at: Date.now() } }
}

/** OpenStreetMap search (no script): one at a time, as its rules ask. */
async function osm(trip: Trip, p: Place): Promise<Found | undefined> {
  const c = trip.base ?? trip.dest
  const box = [c.lng - 0.6, c.lat + 0.6, c.lng + 0.6, c.lat - 0.6].join(',')
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&viewbox=${box}&bounded=1&q=${encodeURIComponent(p.name)}`)
  if (!r.ok) return undefined
  const j = await r.json() as { lat: string; lon: string; display_name: string; category?: string }[]
  return j[0] ? { lat: +j[0].lat, lng: +j[0].lon, address: j[0].display_name.split(',').slice(0, 3).join(','), exact: j[0].category !== 'boundary' && j[0].category !== 'place' } : { none: true }
}

/** Checks up to 30 places' locations, most useful first. */
export async function locateAll(trip: Trip, only?: Place[]): Promise<void> {
  if (DEMO) return
  const rank = (p: Place) => (p.day != null ? 0 : p.status === 'picked' ? 1 : 2)
  const todo = (only ?? tripPlaces(trip.id)).filter((p) => unchecked(p) && !asked.has(p.id)).sort((a, b) => rank(a) - rank(b)).slice(0, 30)
  if (!todo.length) return
  todo.forEach((p) => asked.add(p.id))
  if (connected() && (syncState.get().script ?? 0) >= 7) {
    for (let i = 0; i < todo.length; i += 15) {
      const batch = todo.slice(i, i + 15)
      const res = await call<{ places: Record<string, Found> }>({ op: 'locate', near: trip.dest.name, center: trip.base ?? trip.dest, places: batch.map((p) => ({ id: p.id, name: p.name })) }, 120000)
      const changed = batch.map((p) => apply(trip, p, res.places?.[p.id], 'google')).filter((x): x is Place => !!x)
      if (changed.length) save('place', changed)
    }
    return
  }
  for (const p of todo.slice(0, 12)) {
    try { const c = apply(trip, p, await osm(trip, p), 'osm'); if (c) save('place', [c]) } catch { asked.delete(p.id) }
    await new Promise((r) => setTimeout(r, 1100))
  }
}

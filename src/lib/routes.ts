// Real travel times from the hotel: Google Maps directions through the family script (free).
// Each place is looked up once per hotel and saved with it (so the other phone has it too).
// Until then, or without the script, the app shows its own estimate, marked "≈".
import { places, save, tripPlaces } from './data'
import { call, connected, syncState, SCRIPT_NEEDED } from './sync'
import { km, leg, options, pick, type Mode } from './geo'
import { youngKids } from './people'
import { dateOf } from './planner'
import type { Place, Trip } from './model'

export const baseKey = (b: { lat: number; lng: number }) => `${b.lat.toFixed(4)},${b.lng.toFixed(4)}`

export interface FromHotel { mode: Mode; minutes: number; km: number; times: Partial<Record<Mode, number>>; real: boolean }

export function fromHotel(trip: Trip, p: Place): FromHotel | null {
  if (!trip.base) return null
  const r = p.route
  if (r && r.from === baseKey(trip.base)) {
    const times = { walk: r.walk, transit: r.transit, car: r.car }
    const best = pick(times)
    if (best) return { ...best, km: r.km ?? r.walkKm ?? km(trip.base, p) * 1.3, times, real: true }
  }
  const kids = youngKids(trip)
  const l = leg(trip.base, p, kids)
  const o = options(trip.base, p, kids)
  const times: Partial<Record<Mode, number>> = {}
  for (const m of ['walk', 'transit', 'car'] as Mode[]) if (isFinite(o[m])) times[m] = Math.round(o[m])
  return { mode: l.mode, minutes: l.minutes, km: l.km * 1.3, times, real: false }
}

const want = (trip: Trip, p: Place) => !!trip.base && !(p.booked && p.kind === 'other') && p.route?.from !== baseKey(trip.base) && !p.scoring

/** Depart time for the lookup: 10 AM on the first trip day still ahead (destination time, roughly). */
function departAt(trip: Trip): number {
  const day = new Date(dateOf(trip, 1) + 'T10:00:00Z').getTime()
  return Math.max(day, Date.now() + 10 * 60000)
}

const asked = new Set<string>()
/** Looks up places that don't have real times yet (most useful first), 10 per call. */
export async function routesFor(trip: Trip, only?: Place[]): Promise<void> {
  if (!connected() || !trip.base || (syncState.get().script ?? 0) < SCRIPT_NEEDED) return
  const rank = (p: Place) => (p.day != null ? 0 : p.status === 'picked' ? 1 : p.status === 'maybe' ? 2 : 3)
  const todo = (only ?? tripPlaces(trip.id)).filter((p) => want(trip, p) && !asked.has(p.id + baseKey(trip.base!))).sort((a, b) => rank(a) - rank(b)).slice(0, 30)
  for (let i = 0; i < todo.length; i += 10) {
    const batch = todo.slice(i, i + 10)
    batch.forEach((p) => asked.add(p.id + baseKey(trip.base!)))
    const res = await call<{ routes: Record<string, { walk?: number; transit?: number; car?: number; km?: number; walkKm?: number }> }>({ op: 'routes', from: trip.base, depart: departAt(trip), to: batch.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })) }, 120000)
    const changed: Place[] = []
    for (const p of batch) {
      const r = res.routes?.[p.id]
      const cur = places.get()[p.id]
      if (!r || !cur || (r.walk == null && r.transit == null && r.car == null)) continue
      changed.push({ ...cur, route: { from: baseKey(trip.base!), walk: r.walk, transit: r.transit, car: r.car, km: r.km, walkKm: r.walkKm, at: Date.now() } })
    }
    if (changed.length) save('place', changed)
  }
}

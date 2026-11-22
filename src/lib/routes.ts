// Real travel times from where you are: Google Maps directions through the family script (free).
// Looked up when a place's card opens, kept while the app is open (you move, so not saved).
// Until then, or without the script, the app shows its own estimate, marked "≈".
import { call, connected, syncState, SCRIPT_NEEDED } from './sync'
import { km, leg, options, pick, type Mode } from './geo'
import { youngKids } from './people'
import type { Place, Trip } from './model'
import type { Point } from './geo'
import { createStore } from './store'

const asked = new Set<string>()

export interface Travel { mode: Mode; minutes: number; km: number; times: Partial<Record<Mode, number>>; real: boolean }
type Times = { walk?: number; transit?: number; car?: number; km?: number; walkKm?: number }

/** Real times from where the phone is (memory only: you move). Key: spot (~100 m) + place. */
const hereTimes = createStore<Record<string, Times>>({})
const spot = (pt: Point) => `${pt.lat.toFixed(3)},${pt.lng.toFixed(3)}`

/** Times from `origin` (where the phone is): Google Maps once fetched, the app's estimate until then. */
export function travelFrom(trip: Trip, p: Place, origin: Point): Travel {
  const o0 = origin
  const r: Times | undefined = hereTimes.get()[spot(origin) + '|' + p.id]
  if (r) {
    const times = { walk: r.walk, transit: r.transit, car: r.car }
    const best = pick(times)
    if (best) return { ...best, km: r.km ?? r.walkKm ?? km(o0, p) * 1.3, times, real: true }
  }
  const kids = youngKids(trip)
  const l = leg(o0, p, kids)
  const o = options(o0, p, kids)
  const times: Partial<Record<Mode, number>> = {}
  for (const m of ['walk', 'transit', 'car'] as Mode[]) if (isFinite(o[m])) times[m] = Math.round(o[m])
  return { mode: l.mode, minutes: l.minutes, km: l.km * 1.3, times, real: false }
}

/** Real times from where the phone is, for one place (when its card opens). */
export async function routeHere(trip: Trip, p: Place, pt: Point): Promise<void> {
  const k = spot(pt) + '|' + p.id
  if (!connected() || (syncState.get().script ?? 0) < SCRIPT_NEEDED || hereTimes.get()[k] || asked.has(k)) return
  asked.add(k)
  const res = await call<{ routes: Record<string, Times> }>({ op: 'routes', from: pt, depart: Date.now() + 5 * 60000, to: [{ id: p.id, lat: p.lat, lng: p.lng }] }, 60000)
  const r = res.routes?.[p.id]
  if (r && (r.walk != null || r.transit != null || r.car != null)) hereTimes.set({ ...hereTimes.get(), [k]: r })
}
export const useHereTimes = () => hereTimes.use()

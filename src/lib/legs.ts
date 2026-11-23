// Real travel times between stops (Google Maps, through the family script, free), so a day's
// timings match what the card shows. Each pair of places is looked up once and kept on this
// phone; until then the planner uses its own estimate (shown with ≈).
import { createStore } from './store'
import { pick, type Leg, type Point } from './geo'

type Times = { walk?: number; transit?: number; car?: number; km?: number; walkKm?: number }
export const realLegs = createStore<Record<string, Times>>({}, 'legs')

const spot = (p: Point) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
export const legKey = (a: Point, b: Point) => `${spot(a)}>${spot(b)}`

/** The Google Maps leg from a to b, if known (with the same walk-if-only-a-bit-longer rule). */
export function knownLeg(a: Point | undefined, b: Point | undefined, youngKids: boolean): Leg | undefined {
  if (!a || !b) return undefined
  const t = realLegs.get()[legKey(a, b)]
  if (!t) return undefined
  // Google's walking times are for adults: young kids walk about a quarter slower.
  const walk = t.walk != null ? Math.round(t.walk * (youngKids ? 1.25 : 1)) : undefined
  const best = pick({ walk, transit: t.transit, car: t.car })
  if (!best) return undefined
  const km = t.km ?? t.walkKm ?? 0
  return { minutes: best.minutes, mode: best.mode, km, walkKm: best.mode === 'walk' ? t.walkKm ?? km : best.mode === 'transit' ? 0.6 : 0.1, real: true }
}

/**
 * Looks up the legs of today's and the next 3 days' plans that aren't known yet (from your base to
 * the first stop, stop to stop, and back for downtime), up to 20 per run, grouped by start point.
 */
export async function fetchLegs(trip: import('./model').Trip, plans: import('./planner').DayPlan[], today: number): Promise<void> {
  const { call, connected, syncState } = await import('./sync')
  if (!connected() || (syncState.get().script ?? 0) < 6) return
  const want = new Map<string, { a: Point; b: Point }>()
  for (const plan of plans.filter((p) => p.day >= Math.max(1, today) && p.day <= Math.max(1, today) + 3)) {
    let pos: Point | undefined = trip.base
    for (const s of plan.slots) {
      const to: Point | undefined = s.kind === 'downtime' ? trip.base : s.place
      if (!to || s.kind === 'lunch') continue
      if (pos && s.travel.minutes > 0 && !s.travel.real) want.set(legKey(pos, to), { a: pos, b: to })
      if (s.travel.minutes > 0 || s.kind === 'downtime' || !pos) pos = to
    }
  }
  const todo = [...want.entries()].filter(([k]) => !realLegs.get()[k]).slice(0, 20)
  const byFrom = new Map<string, { a: Point; items: { key: string; b: Point }[] }>()
  for (const [key, { a, b }] of todo) {
    const g = byFrom.get(spot(a)) ?? { a, items: [] }
    g.items.push({ key, b }); byFrom.set(spot(a), g)
  }
  for (const { a, items } of byFrom.values()) {
    const res = await call<{ routes: Record<string, Times> }>({ op: 'routes', from: a, depart: Date.now() + 10 * 60000, to: items.map((x) => ({ id: x.key, lat: x.b.lat, lng: x.b.lng })) }, 120000)
    const got: Record<string, Times> = {}
    for (const x of items) { const r = res.routes?.[x.key]; if (r && (r.walk != null || r.transit != null || r.car != null)) got[x.key] = r }
    if (Object.keys(got).length) realLegs.set({ ...realLegs.get(), ...got })
  }
}

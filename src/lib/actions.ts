// Every change the screens make, in one place, so Card, Plan, Ask and Rebalance all do the
// same thing the same way (and each gets an Undo).
import type { DayMeta, Place, Status, Trip } from './model'
import { days, places, save, trips, tripPlaces, newId } from './data'
import { between, byRank } from './rank'
import { dayPlaces } from './planner'
import { PACE_DEFAULTS } from './people'
import type { Proposal } from './rebalance'

const one = (id: string) => places.get()[id]
const put = (p: Place, label?: string) => save('place', [p], label)

export function setStatus(id: string, status: Status) {
  const p = one(id)
  if (!p || p.status === status) return
  if (p.must && status === 'out') return pushDown(id)
  const label = status === 'out' ? `${p.name} eliminated` : status === 'picked' ? `${p.name} picked` : `${p.name} moved to Maybe`
  // Eliminated places leave their day.
  put({ ...p, status, ...(status === 'out' ? { day: null } : {}) }, label)
}

/** Must-sees can't be eliminated: they go to the bottom of Picked instead. */
export function pushDown(id: string) {
  const p = one(id)
  if (!p) return
  const last = tripPlaces(p.trip).filter((x) => x.status === p.status).sort(byRank).at(-1)
  if (last?.id === p.id) return
  put({ ...p, rank: between(last?.rank, undefined) }, `${p.name} moved to the bottom`)
}

export function setMust(id: string, must: boolean) {
  const p = one(id)
  if (!p) return
  put({ ...p, must, status: must && p.status === 'out' ? 'picked' : p.status }, must ? `${p.name} is a must-see` : `${p.name} is no longer a must-see`)
}

export function setDone(id: string, done: boolean) {
  const p = one(id)
  if (p) put({ ...p, done }, done ? `${p.name} done` : undefined)
}

export function setMinutes(id: string, minutes: number) {
  const p = one(id)
  if (p) put({ ...p, minutes })
}

/** Put a place on a day (at the end), or take it off (day = null). */
export function setDay(id: string, day: number | null) {
  const p = one(id)
  if (!p || p.day === day) return
  if (day == null) return put({ ...p, day: null, fixed: p.booked ? p.fixed : null }, `${p.name} taken off Day ${p.day}`)
  const last = dayPlaces(tripPlaces(p.trip), day).at(-1)
  put({ ...p, day, dayRank: between(last?.dayRank, undefined), status: p.status === 'out' ? 'picked' : p.status === 'maybe' ? 'picked' : p.status }, `${p.name} added to Day ${day}`)
}

/** Reorder in the master list: place `id` between two neighbours (and maybe into another section). */
export function moveInList(id: string, before: Place | undefined, after: Place | undefined, status?: Status) {
  const p = one(id)
  if (!p) return
  const next: Place = { ...p, rank: between(before?.rank, after?.rank) }
  if (status && status !== p.status) { if (p.must && status === 'out') return; next.status = status }
  put(next)
}

/**
 * Reorder within a day. For a place, `prev`/`next` are the nearest places around the drop spot.
 * Downtime is stored on the day itself: it goes after `prev` (a place id or 'lunch'), or first.
 */
export function moveInDay(trip: Trip, day: number, id: string, prev?: string, next?: string) {
  if (id === 'downtime') {
    const key = `${trip.id}:${day}`
    const meta: DayMeta = days.get()[key] ?? { id: key, trip: trip.id, day, at: 0 }
    save('day', [{ ...meta, downtimeAfter: prev ?? '^' }])
    return
  }
  const p = one(id)
  if (!p) return
  const list = dayPlaces(tripPlaces(trip.id), day)
  const lo = list.find((x) => x.id === prev), hi = list.find((x) => x.id === next)
  put({ ...p, dayRank: between(lo?.dayRank, hi?.dayRank) })
}

export function applyProposal(pr: Proposal) {
  if (!pr.places.length) return
  save('place', pr.places, pr.places.length === 1 ? `Moved ${pr.places[0].name}` : `${pr.places.length} changes applied`)
}

export function newTrip(): Trip {
  const d = PACE_DEFAULTS.balanced
  const t: Trip = {
    id: newId(), name: '', dest: { name: '', lat: 0, lng: 0, tz: 'UTC', country: '', currency: 'USD', lang: 'en' },
    start: '', end: '', vibes: {}, budget: { all: 2 }, pace: 'balanced', people: [],
    dayStart: d.dayStart, dayEnd: d.dayEnd, downtime: { on: true, minutes: d.downtime }, food: '', nos: [], home: 'USD', at: Date.now(),
  }
  save('trip', [t])
  return t
}

export function saveTrip(t: Trip) { save('trip', [t]) }

export function deleteTrip(id: string) {
  const ps = tripPlaces(id).map((p) => p.id)
  save('place', [], undefined, ps)
  save('trip', [], 'Trip deleted', [id])
}

export const tripOf = (id: string) => trips.get()[id]

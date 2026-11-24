// Every change the screens make, in one place, so Card, Plan, Ask and Rebalance all do the
// same thing the same way (and each gets an Undo).
import type { DayMeta, Place, Status, Trip } from './model'
import { days, nowIn, places, save, trips, tripPlaces, newId } from './data'
import { between, byRank } from './rank'
import { dayPlaces, planDay } from './planner'
import { defaultFamily, PACE_DEFAULTS } from './people'
import { clock, localNow } from './time'
import type { Proposal } from './rebalance'

const one = (id: string) => places.get()[id]
const put = (p: Place, label?: string) => save('place', [p], label)

export function setStatus(id: string, status: Status) {
  const p = one(id)
  if (!p || p.status === status) return
  if (p.must && status === 'out') return pushDown(id)
  // Checking and unchecking is instant and obvious; only skipping (it hides the place) gets a toast.
  const label = status === 'out' ? `${p.name} skipped` : p.status === 'out' ? `${p.name} is back` : undefined
  // Skipped places leave their day.
  put({ ...p, status, ...(status === 'out' ? { day: null } : {}) }, label)
}

/** Must-sees can't be skipped: they go to the bottom of the list instead. */
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

/** Crossing it off: done, with how the day is going ("3 of 5 done today"). */
export function setDone(id: string, done: boolean) {
  const p = one(id)
  if (!p) return
  if (!done) return put({ ...p, done }, `${p.name}: not done`)
  if (typeof navigator !== 'undefined') navigator.vibrate?.([12, 40, 18])
  const day = p.day != null ? dayPlaces(tripPlaces(p.trip), p.day).filter((x) => !(x.booked && x.kind === 'other')) : []
  const doneN = day.filter((x) => x.done || x.id === p.id).length
  const label = !day.length ? `✓ ${p.name} crossed off` : doneN === day.length ? `🎉 All ${day.length} done for the day!` : `✓ ${p.name} · ${doneN} of ${day.length} done`
  put({ ...p, done }, label)
}

export function setMinutes(id: string, minutes: number) {
  const p = one(id)
  if (p) put({ ...p, minutes })
}

/** Put a place on a day (at the end), or take it off (day = null). */
export function setDay(id: string, day: number | null) {
  const p = one(id)
  if (!p || p.day === day) return
  // No adding to a day that's already gone (from any screen, Ask included).
  const t = trips.get()[p.trip]
  if (day != null && t && day < nowIn(t).day) return
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
  // Dragging a stop you'd pinned to a time lets the planner time it again (bookings keep theirs).
  put({ ...p, dayRank: between(lo?.dayRank, hi?.dayRank), ...(p.fixed != null && !p.booked ? { fixed: null } : {}) })
}

/**
 * Your own start time for a stop on a day (null = the planner times it). The stop moves to its
 * place in the day's order, and the planner fits everything else around it.
 */
export function setTime(trip: Trip, id: string, min: number | null) {
  const p = one(id)
  if (!p || p.day == null) return
  if (min == null) return put({ ...p, fixed: null }, `${p.name}: timed by the planner`)
  const others = planDay(trip, p.day, tripPlaces(trip.id), days.get()[`${trip.id}:${p.day}`]).slots.filter((s) => s.kind === 'place' && s.id !== id)
  const i = others.findIndex((s) => s.start > min)
  const before = others[i === -1 ? others.length - 1 : i - 1]?.place, after = i === -1 ? undefined : others[i]?.place
  put({ ...p, fixed: min, slotted: true, dayRank: between(before?.dayRank, after?.dayRank) }, `${p.name} at ${clock(min)}`)
}

/** "Go now": put a place into today, right after what's happening now (or first, before the next stop). */
export function addNow(trip: Trip, id: string, today: number, nowMin: number, slots: { id: string; kind: string; start: number; end: number }[]) {
  const p = one(id)
  if (!p) return
  const list = dayPlaces(tripPlaces(trip.id), today).filter((x) => x.id !== id)
  // The last place that has started by now; the new one goes right after it.
  const startedIds = new Set(slots.filter((s) => s.kind === 'place' && s.start <= nowMin).map((s) => s.id))
  const before = [...list].reverse().find((x) => startedIds.has(x.id))
  const after = before ? list[list.indexOf(before) + 1] : list[0]
  put({ ...p, day: today, dayRank: between(before?.dayRank, after?.dayRank), status: 'picked' }, `${p.name} added to today`)
}

export function applyProposal(pr: Proposal) {
  if (!pr.places.length) return
  save('place', pr.places, pr.places.length === 1 ? `Moved ${pr.places[0].name}` : `${pr.places.length} changes applied`)
}

export function newTrip(): Trip {
  const d = PACE_DEFAULTS.balanced
  const t: Trip = {
    id: newId(), name: '', dest: { name: '', lat: 0, lng: 0, tz: 'UTC', country: '', currency: 'USD', lang: 'en' },
    start: '', end: '', vibes: {}, budget: { all: 2 }, pace: 'balanced', people: defaultFamily(Object.values(trips.get()), localNow(Intl.DateTimeFormat().resolvedOptions().timeZone).date),
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

// Rebalance: one proposal used by Days (Review), Plan's must-sees (Fix it), and later rain and
// flight changes. Saves at-risk must-sees first, then unloads days that run late or walk too far.
// Never touches today (it's underway), bookings, or done places.
import type { DayMeta, Place, Trip } from './model'
import { between } from './rank'
import { dateOf, dayPlaces, hoursOn, planDay, tripDays, type DayPlan } from './planner'
import { mustInfo } from './musts'

export interface Change {
  id: string
  name: string
  from: { day: number | null; time?: number }
  to: { day: number | null; time?: number }
  why: string
}
export interface Proposal { changes: Change[]; places: Place[]; note?: string }

/**
 * First plan after the list is built: must-sees first (fewest open days first), then the most
 * worth-it places while days have room, a couple of meals per day. Returns every place.
 */
export function autoPlan(trip: Trip, all: Place[], metas: Record<string, DayMeta> = {}): Place[] {
  const n = tripDays(trip)
  const work = all.map((p) => ({ ...p, day: p.fixed != null ? p.day : null }))
  const list = () => work
  const plan = (d: number) => planDay(trip, d, list(), metas[`${trip.id}:${d}`])
  const days = Array.from({ length: n }, (_, i) => i + 1)
  const cap = trip.pace === 'slow' ? 3 : trip.pace === 'packed' ? 5 : 4
  const count = (d: number, meal: boolean) => dayPlaces(list(), d).filter((p) => (p.kind === 'meal') === meal).length
  const place = (p: Place, meal: boolean) => {
    let best: { day: number; rank: string; cost: number } | null = null
    for (const d of days) {
      if (hoursOn(p, dateOf(trip, d)) === null) continue
      if (count(d, meal) >= (meal ? 2 : cap)) continue
      p.day = null
      const before = plan(d)
      const others = dayPlaces(list(), d)
      for (let i = 0; i <= others.length; i++) {
        p.day = d
        p.dayRank = between(others[i - 1]?.dayRank, others[i]?.dayRank)
        const after = plan(d)
        const slot = after.slots.find((s) => s.id === p.id)
        if (!slot || slot.warn || after.late || after.over || after.issues.length > before.issues.length) continue
        const cost = (after.end - before.end) + after.walkMi * 8 + dayPlaces(list(), d).length * 20
        if (!best || cost < best.cost) best = { day: d, rank: p.dayRank, cost }
      }
    }
    p.day = best?.day ?? null
    if (best) { p.dayRank = best.rank; p.status = 'picked' }
  }
  const openDays = (p: Place) => days.filter((d) => hoursOn(p, dateOf(trip, d)) !== null).length
  const musts = work.filter((p) => p.must && p.status !== 'out' && p.day == null).sort((a, b) => openDays(a) - openDays(b) || b.worth - a.worth)
  for (const p of musts) place(p, false)
  const vibe = (p: Place) => p.worth + p.sub.vibe * 0.2 + p.sub.kid * (trip.people.some((x) => x.age < 13) ? 0.15 : 0)
  for (const p of work.filter((x) => !x.must && x.status !== 'out' && x.day == null && x.kind !== 'meal' && x.kind !== 'snack' && x.worth >= 7).sort((a, b) => vibe(b) - vibe(a))) place(p, false)
  for (const p of work.filter((x) => x.status !== 'out' && x.day == null && x.kind === 'meal').sort((a, b) => vibe(b) - vibe(a))) place(p, true)
  return work
}

export function rebalance(trip: Trip, all: Place[], metas: Record<string, DayMeta>, today: number, now: number): Proposal {
  const n = tripDays(trip)
  const first = Math.max(1, today + 1)
  const work = new Map(all.map((p) => [p.id, { ...p }]))
  const list = () => [...work.values()]
  const plan = (d: number) => planDay(trip, d, list(), metas[`${trip.id}:${d}`])
  const why = new Map<string, string>()
  const notes: string[] = []
  const days: number[] = []
  for (let d = first; d <= n; d++) days.push(d)

  const badness = (p: DayPlan) => p.slots.filter((s) => s.warn).length + (p.late ? 1 : 0) + (p.over ? 1 : 0)

  /** Best spot for a place across the given days, or null. Leaves the place unscheduled. */
  function bestSpot(p: Place, onlyDays = days): { day: number; rank: string } | null {
    let best: { day: number; rank: string; cost: number } | null = null
    for (const d of onlyDays) {
      if (hoursOn(p, dateOf(trip, d)) === null) continue
      p.day = null
      const before = plan(d)
      const base = badness(before)
      const others = dayPlaces(list(), d)
      for (let i = 0; i <= others.length; i++) {
        p.day = d
        p.dayRank = between(others[i - 1]?.dayRank, others[i]?.dayRank)
        const after = plan(d)
        const slot = after.slots.find((s) => s.id === p.id)
        if (!slot || slot.warn || after.late || after.over || badness(after) > base) continue
        const cost = (after.end - before.end) + after.walkMi * 6 + (d - first) * 4
        if (!best || cost < best.cost) best = { day: d, rank: p.dayRank, cost }
      }
    }
    p.day = null
    return best && { day: best.day, rank: best.rank }
  }

  // 1. Must-sees at risk, fewest options first.
  const plans = Array.from({ length: n }, (_, i) => plan(i + 1))
  const risky = mustInfo(trip, list(), plans, today, now).filter((i) => i.state === 'risk' || i.state === 'last')
  for (const info of risky) {
    const p = work.get(info.place.id)!
    if (p.fixed != null || p.done) continue
    if (p.day != null && p.day <= today) continue // today's plan is underway; Today asks "done?"
    const prev = { day: p.day ?? null, rank: p.dayRank }
    let spot = bestSpot(p)
    if (!spot) {
      // Make room: move the least worth-it, unbooked place off a day.
      for (const d of days) {
        if (hoursOn(p, dateOf(trip, d)) === null) continue
        const bumpable = dayPlaces(list(), d).filter((q) => !q.must && q.fixed == null && !q.done && q.id !== p.id).sort((a, b) => a.worth - b.worth)
        for (const q of bumpable) {
          q.day = null
          spot = bestSpot(p, [d])
          if (spot) {
            why.set(q.id, `Makes room for ${p.name} on Day ${d}.`)
            const home = bestSpot(q, days.filter((x) => x !== d))
            if (home) { q.day = home.day; q.dayRank = home.rank; why.set(q.id, `Makes room for ${p.name}; moved to Day ${home.day}.`) }
            break
          }
          q.day = d
        }
        if (spot) break
      }
    }
    if (spot) {
      p.day = spot.day
      p.dayRank = spot.rank
      why.set(p.id, prev.day == null ? `Must-see: open on Day ${spot.day}.` : `Must-see: fits better on Day ${spot.day}.`)
    } else {
      p.day = prev.day
      p.dayRank = prev.rank
      notes.push(`No room found for ${p.name}. Try a shorter visit or fewer stops.`)
    }
  }

  // 2. Days that run late or walk too far: move the least worth-it stop to a day with room.
  for (const d of days) {
    for (let guard = 0; guard < 8; guard++) {
      const pl = plan(d)
      if (!pl.late && !pl.over) break
      const q = dayPlaces(list(), d).filter((x) => !x.must && x.fixed == null && !x.done).sort((a, b) => a.worth - b.worth)[0]
      if (!q) break
      q.day = null
      const home = bestSpot(q, days.filter((x) => x !== d))
      if (home) { q.day = home.day; q.dayRank = home.rank; why.set(q.id, `Day ${d} ran ${pl.late ? 'late' : 'too far'}; moved to Day ${home.day}.`) }
      else why.set(q.id, `Day ${d} ran ${pl.late ? 'late' : 'too far'}; back to the list for now.`)
    }
  }

  // What changed, with times before and after.
  const oldPlans = new Map(Array.from({ length: n }, (_, i) => [i + 1, plans[i]]))
  const newPlans = new Map(Array.from({ length: n }, (_, i) => [i + 1, plan(i + 1)]))
  const timeIn = (m: Map<number, DayPlan>, id: string, d?: number | null) => (d ? m.get(d)?.slots.find((s) => s.id === id)?.start : undefined)
  const changes: Change[] = []
  const changed: Place[] = []
  for (const p of work.values()) {
    const o = all.find((x) => x.id === p.id)!
    if ((o.day ?? null) === (p.day ?? null) && (o.dayRank === p.dayRank || p.day == null)) continue
    changes.push({ id: p.id, name: p.name, from: { day: o.day ?? null, time: timeIn(oldPlans, p.id, o.day) }, to: { day: p.day ?? null, time: timeIn(newPlans, p.id, p.day) }, why: why.get(p.id) ?? 'Keeps the days balanced.' })
    changed.push(p)
  }
  return { changes, places: changed, note: notes.join(' ') || undefined }
}

/**
 * Bookings that arrived from email (rank starting with "a", set by the family script) are slotted
 * once into the best spot of their day: where you arrive in time, with the fewest problems.
 * The order you chose for everything else stays as it is. Returns the bookings it moved.
 */
export function slotBookings(trip: Trip, all: Place[], metas: Record<string, DayMeta> = {}): Place[] {
  const work = all.map((p) => ({ ...p }))
  const moved: Place[] = []
  const fresh = work.filter((p) => p.booked && p.day != null && p.fixed != null && (p.dayRank ?? '').startsWith('a') && (p.dayRank ?? '').endsWith('i'))
  for (const p of fresh.sort((a, b) => (a.fixed ?? 0) - (b.fixed ?? 0))) {
    const others = dayPlaces(work, p.day!).filter((x) => x.id !== p.id)
    let best: { rank: string; cost: number } | null = null
    for (let i = 0; i <= others.length; i++) {
      p.dayRank = between(others[i - 1]?.dayRank, others[i]?.dayRank)
      const plan = planDay(trip, p.day!, work, metas[`${trip.id}:${p.day}`])
      const slot = plan.slots.find((s) => s.id === p.id)
      if (!slot) continue
      const cost = (slot.warn ? 1000 : 0) + plan.issues.length * 100 + (slot.wait ?? 0) + (plan.late ? 50 : 0)
      if (!best || cost < best.cost) best = { rank: p.dayRank, cost }
    }
    if (best) { p.dayRank = best.rank; moved.push(p) }
  }
  return moved
}

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

/** Puts one place on its best day among `days` (earliest end, least walking, lightest day). */
function placer(trip: Trip, work: Place[], metas: Record<string, DayMeta>, days: number[], capBonus = 0) {
  const plan = (d: number) => planDay(trip, d, work, metas[`${trip.id}:${d}`])
  const cap = (trip.pace === 'slow' ? 3 : trip.pace === 'packed' ? 5 : 4) + capBonus
  const count = (d: number, meal: boolean) => dayPlaces(work, d).filter((p) => (p.kind === 'meal') === meal).length
  return (p: Place, meal: boolean): boolean => {
    let best: { day: number; rank: string; cost: number } | null = null
    for (const d of days) {
      if (hoursOn(p, dateOf(trip, d)) === null) continue
      if (count(d, meal) >= (meal ? 2 + capBonus : cap)) continue
      p.day = null
      const before = plan(d)
      const others = dayPlaces(work, d)
      for (let i = 0; i <= others.length; i++) {
        p.day = d
        p.dayRank = between(others[i - 1]?.dayRank, others[i]?.dayRank)
        const after = plan(d)
        const slot = after.slots.find((s) => s.id === p.id)
        if (!slot || slot.warn || after.late || after.over || after.issues.length > before.issues.length) continue
        const cost = (after.end - before.end) + after.walkMi * 8 + dayPlaces(work, d).length * 20
        if (!best || cost < best.cost) best = { day: d, rank: p.dayRank, cost }
      }
    }
    p.day = best?.day ?? null
    if (best) p.dayRank = best.rank
    return !!best
  }
}

const openDays = (trip: Trip, p: Place, days: number[]) => days.filter((d) => hoursOn(p, dateOf(trip, d)) !== null).length
const vibeOf = (trip: Trip) => (p: Place) => p.worth + p.sub.vibe * 0.2 + p.sub.kid * (trip.people.some((x) => x.age < 13) ? 0.15 : 0)
const isMeal = (p: Place) => p.kind === 'meal' || p.kind === 'snack'

/**
 * First plan after the list is built: must-sees first (fewest open days first), then the most
 * worth-it places while days have room, a couple of meals per day. Placed ones start checked.
 */
export function autoPlan(trip: Trip, all: Place[], metas: Record<string, DayMeta> = {}): Place[] {
  const days = Array.from({ length: tripDays(trip) }, (_, i) => i + 1)
  const work = all.map((p) => ({ ...p, day: p.fixed != null ? p.day : null }))
  const place = placer(trip, work, metas, days)
  const vibe = vibeOf(trip)
  const pick = (p: Place, meal: boolean) => { if (place(p, meal)) p.status = 'picked' }
  for (const p of work.filter((p) => p.must && p.status !== 'out' && p.day == null).sort((a, b) => openDays(trip, a, days) - openDays(trip, b, days) || b.worth - a.worth)) pick(p, false)
  for (const p of work.filter((x) => !x.must && x.status !== 'out' && x.day == null && !isMeal(x) && x.worth >= 7).sort((a, b) => vibe(b) - vibe(a))) pick(p, false)
  for (const p of work.filter((x) => x.status !== 'out' && x.day == null && x.kind === 'meal').sort((a, b) => vibe(b) - vibe(a))) pick(p, true)
  return work
}

/** What "Plan my days" would change: checked places with no day, unchecked ones still on a day. */
export function planPending(all: Place[], fromDay: number) {
  const add = all.filter((p) => p.status === 'picked' && p.day == null && !p.done && !p.scoring)
  const remove = all.filter((p) => p.status !== 'picked' && p.day != null && p.day >= fromDay && p.fixed == null && !p.done)
  return { add, remove }
}

/**
 * "Plan my days": unchecked places leave the days, checked ones with no day are fitted in.
 * Days already planned keep their stops; bookings, done places and today stay as they are.
 */
export function planChecked(trip: Trip, all: Place[], metas: Record<string, DayMeta>, fromDay: number): { places: Place[]; added: number; removed: number; unfit: Place[] } {
  const days = Array.from({ length: tripDays(trip) }, (_, i) => i + 1).filter((d) => d >= fromDay)
  const work = all.map((p) => ({ ...p }))
  const { add, remove } = planPending(work, fromDay)
  for (const p of remove) p.day = null
  const place = placer(trip, work, metas, days, 1)
  const vibe = vibeOf(trip)
  const order = [...add].sort((a, b) => Number(isMeal(a)) - Number(isMeal(b)) || Number(b.must) - Number(a.must) || (a.must && b.must ? openDays(trip, a, days) - openDays(trip, b, days) : 0) || vibe(b) - vibe(a))
  const unfit: Place[] = []
  for (const p of order) if (!place(p, p.kind === 'meal')) unfit.push(p)
  const before = new Map(all.map((p) => [p.id, p]))
  const changed = work.filter((p) => { const o = before.get(p.id)!; return o.day !== p.day || (p.day != null && o.dayRank !== p.dayRank) })
  return { places: changed, added: add.length - unfit.length, removed: remove.length, unfit }
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
  const fresh = work.filter((p) => p.booked && p.day != null && p.fixed != null && !p.slotted && /^a[0-9a-z]+i$/.test(p.dayRank ?? ''))
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
    p.slotted = true
    if (best) p.dayRank = best.rank
    moved.push(p)
  }
  return moved
}

// "What now?": the best thing to do in a free gap, ranked on the phone so every tap is instant.
import type { Energy, Place, Trip } from './model'
import { leg, type Leg, type Point } from './geo'
import { hoursOn, type DayPlan, type Slot } from './planner'
import { youngKids } from './people'

export interface Idea { place: Place; travel: Leg; minutes: number }
export interface Gap { minutes: number; next?: Slot; here?: Point }

const REST: Place['kind'][] = ['park', 'outdoors', 'kids', 'snack']

/** The free time before the next stop (or the end of the day). */
export function gapNow(trip: Trip, plan: DayPlan | undefined, now: number, here?: Point): Gap {
  const slots = plan?.slots ?? []
  const next = slots.find((s) => s.start > now)
  const current = slots.find((s) => s.start <= now && s.end > now)
  if (current && current.kind !== 'lunch') return { minutes: 0, next: current }
  const prev = [...slots].reverse().find((s) => s.end <= now)
  const pos = here ?? prev?.place ?? trip.base
  if (!next) return { minutes: Math.max(0, trip.dayEnd - now), here: pos }
  return { minutes: Math.max(0, next.start - now), next, here: pos }
}

export function ideas(trip: Trip, places: Place[], date: string, now: number, gap: Gap, energy: Energy): Idea[] {
  const kids = youngKids(trip)
  const nextPlace = gap.next?.place
  const out: { idea: Idea; score: number }[] = []
  for (const p of places) {
    if (p.done || p.status === 'out' || p.day != null || p.scoring) continue
    const travel = leg(gap.here, p, kids)
    const tired = energy === 'tired'
    if (tired && travel.minutes > 15) continue
    const stay = tired ? Math.min(p.minutes, 45) : p.minutes
    if (stay < p.minutes && !REST.includes(p.kind) && p.kind !== 'sight') continue // museums don't shrink well
    const back = nextPlace ? leg(p, nextPlace, kids).minutes : 0
    if (travel.minutes + stay + back > gap.minutes) continue
    const h = hoursOn(p, date)
    const arrive = now + travel.minutes
    if (h === null || (h && (arrive < h[0] || arrive + stay > h[1]))) continue
    let score = p.worth + p.value * 0.3 - travel.minutes / 6 + (p.must ? 3 : 0) + (p.price === 0 ? 0.5 : 0)
    if (tired && REST.includes(p.kind)) score += 2.5
    if (energy === 'fresh' && (p.kind === 'museum' || p.kind === 'sight')) score += 1
    out.push({ idea: { place: p, travel, minutes: stay }, score })
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.idea)
}

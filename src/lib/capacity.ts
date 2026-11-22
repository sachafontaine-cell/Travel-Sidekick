// "Room left": how much time the days still ahead hold for activities, against what's checked.
// A rough guide for choosing (the planner does the exact fitting).
import type { Place, Trip } from './model'
import { nowIn } from './data'
import { tripDays } from './planner'

const TRAVEL = 25 // minutes of getting there, per stop

export interface Capacity { hold: number; used: number; left: number; days: number }

export function capacity(trip: Trip, all: Place[]): Capacity {
  const now = nowIn(trip)
  const from = now.day >= 1 ? now.day + 1 : 1
  const days = Math.max(0, tripDays(trip) - from + 1)
  const perDay = Math.max(0, trip.dayEnd - trip.dayStart - 45 - (trip.downtime.on ? trip.downtime.minutes : 0))
  const booked = all.filter((p) => p.booked && p.day != null && p.day >= from).reduce((a, p) => a + p.minutes, 0)
  const hold = Math.max(0, days * perDay - booked)
  const used = all.filter((p) => p.status === 'picked' && !p.done && !p.booked && (p.day == null || p.day >= from)).reduce((a, p) => a + p.minutes + TRAVEL, 0)
  return { hold, used, left: hold - used, days }
}

/** "Room for about 9 h more (4–5 places)" or "About 3 h more than the days hold". */
export function capacityText(c: Capacity): string {
  if (!c.days) return 'No days left to plan.'
  const h = (m: number) => `${Math.round(Math.abs(m) / 60)} h`
  if (c.left >= 60) return `Room for about ${h(c.left)} more (${Math.max(1, Math.round(c.left / 150))}–${Math.max(1, Math.round(c.left / 100))} places)`
  if (c.left > -60) return 'Your days are about full'
  return `About ${h(c.left)} more than your days hold`
}

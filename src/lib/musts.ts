// Must-see countdown: done, scheduled, at risk, last chance. "Never miss a must-see."
import type { Place, Trip } from './model'
import { closedDays, dateOf, hoursOn, tripDays, type DayPlan } from './planner'
import { clock, WEEKDAY, weekday } from './time'

export type MustState = 'done' | 'scheduled' | 'risk' | 'last' | 'missed'
export interface MustInfo { place: Place; state: MustState; line: string }

export const STATE_LABEL: Record<MustState, string> = { done: 'Done', scheduled: 'Scheduled', risk: 'At risk', last: 'Last chance', missed: 'No day left' }

/**
 * @param today trip day number (0 before the trip, N+1 after)
 * @param now minutes into today (destination time)
 */
export function mustInfo(trip: Trip, places: Place[], plans: DayPlan[], today: number, now: number): MustInfo[] {
  const n = tripDays(trip)
  const out: MustInfo[] = []
  for (const p of places) {
    if (!p.must || p.status === 'out') continue
    if (p.done) { out.push({ place: p, state: 'done', line: 'Done' }); continue }
    const closed = closedDays(p)
    const closedNote = closed.length && closed.length < 7 ? ` · closed ${closed.join(', ')}` : ''
    if (p.day != null && p.day >= Math.max(today, 1) && p.day <= n) {
      const slot = plans[p.day - 1]?.slots.find((s) => s.id === p.id)
      const when = p.day === today ? 'Today' : `Day ${p.day}`
      if (slot && p.day === today && slot.end <= now) { out.push({ place: p, state: 'risk', line: `Was planned at ${clock(slot.start)}. Done?` }); continue }
      if (slot?.warn) { out.push({ place: p, state: 'risk', line: `${when} · ${slot.warn}` }); continue }
      out.push({ place: p, state: 'scheduled', line: slot ? `${when} · ${clock(slot.start)}` : when })
      continue
    }
    // Not planned (or planned on a day that has passed): which days are still possible?
    const first = today < 1 ? 1 : today
    const open: number[] = []
    for (let d = first; d <= n; d++) {
      if (d === today && now > trip.dayEnd - p.minutes) continue
      if (hoursOn(p, dateOf(trip, d)) !== null) open.push(d)
    }
    if (!open.length) out.push({ place: p, state: 'missed', line: `No open day left${closedNote}` })
    else if (open.length === 1) out.push({ place: p, state: 'last', line: `Last chance: Day ${open[0]} (${WEEKDAY[weekday(dateOf(trip, open[0]))]})${closedNote}` })
    else out.push({ place: p, state: 'risk', line: `Not planned yet · ${open.length} days possible${closedNote}` })
  }
  const order: Record<MustState, number> = { missed: 0, last: 1, risk: 2, scheduled: 3, done: 4 }
  return out.sort((a, b) => order[a.state] - order[b.state] || (a.place.day ?? 99) - (b.place.day ?? 99))
}

export function countdown(trip: Trip, infos: MustInfo[], today: number) {
  const n = tripDays(trip)
  const done = infos.filter((i) => i.state === 'done').length
  const daysLeft = today < 1 ? n : Math.max(0, n - today)
  const atRisk = infos.filter((i) => i.state === 'risk' || i.state === 'last' || i.state === 'missed').length
  return { done, total: infos.length, daysLeft, atRisk }
}

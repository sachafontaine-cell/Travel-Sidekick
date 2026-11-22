// The day planner: plain code, instant, and the same for Days, Today, Rebalance and Ask.
// Times are never stored: they are worked out from the order, bookings, opening hours, meals,
// downtime and walking, every time something changes.
import type { DayMeta, Place, Trip } from './model'
import { km, leg, miles, type Leg, type Point } from './geo'
import { addDays, clock, daysBetween, weekday, WEEKDAY_LONG } from './time'
import { groupLimit, youngKids } from './people'

export interface Slot {
  kind: 'place' | 'downtime' | 'lunch'
  /** The place id, or 'downtime' / 'lunch'. */
  id: string
  place?: Place
  start: number
  end: number
  /** How you get here from the previous stop. */
  travel: Leg
  warn?: string
  /** Minutes spent waiting (opening time, meal time, booking). */
  wait?: number
}

export interface DayPlan {
  day: number
  date: string
  slots: Slot[]
  walkMi: number
  limitMi: number
  over: boolean
  end: number
  late: boolean
  issues: string[]
}

export const LUNCH: [number, number] = [11 * 60 + 30, 14 * 60 + 30]
export const DINNER_FROM = 18 * 60 + 30
const LUNCH_MIN = 45
/** Farther than this from the destination = not part of the day's walking (e.g. the flight from home). */
const FAR_KM = 80

export const tripDays = (t: Pick<Trip, 'start' | 'end'>) => daysBetween(t.start, t.end) + 1
export const dateOf = (t: Pick<Trip, 'start'>, day: number) => addDays(t.start, day - 1)

/** Which trip day a date is: 0 = before the trip, N+1 = after. */
export function dayIndex(t: Pick<Trip, 'start' | 'end'>, date: string): number {
  const n = daysBetween(t.start, date) + 1
  return Math.max(0, Math.min(tripDays(t) + 1, n))
}

const byDayRank = (a: Place, b: Place) => ((a.dayRank ?? '') < (b.dayRank ?? '') ? -1 : (a.dayRank ?? '') > (b.dayRank ?? '') ? 1 : 0)
export const dayPlaces = (all: Place[], day: number) => all.filter((p) => p.day === day && p.status !== 'out').sort(byDayRank)

/** Opening hours on a date: [open, close], null = closed, undefined = unknown. */
export function hoursOn(p: Place, date: string): [number, number] | null | undefined {
  if (!p.hours) return undefined
  if (p.hours.dates && date in p.hours.dates) return p.hours.dates[date]
  if (!p.hours.week) return undefined
  return p.hours.week[weekday(date)] ?? null
}

export function closedDays(p: Place): string[] {
  if (!p.hours?.week) return []
  return p.hours.week.map((h, i) => (h ? '' : WEEKDAY_LONG[i].slice(0, 3))).filter(Boolean)
}

export function planDay(trip: Trip, day: number, all: Place[], meta?: DayMeta): DayPlan {
  const date = dateOf(trip, day)
  const list = dayPlaces(all, day)
  const kids = youngKids(trip)
  const base: Point | undefined = trip.base
  const slots: Slot[] = []
  let pos: Point | undefined = base
  let walkKm = 0
  let cursor = trip.dayStart
  // A booking before the usual start pulls the day earlier.
  if (list[0]?.fixed != null) cursor = Math.min(cursor, list[0].fixed - (trip.dest.lat !== 0 && km(trip.dest, list[0]) > FAR_KM ? 0 : leg(pos, list[0], kids).minutes))

  let lunchDone = false
  const wantDowntime = trip.downtime.on && trip.downtime.minutes > 0
  let downtimeDone = !wantDowntime
  const after = meta?.downtimeAfter
  const afterKnown = after === '^' || after === 'lunch' || (!!after && list.some((p) => p.id === after))

  const addDowntime = () => {
    const travel = leg(pos, base, kids)
    const start = cursor + travel.minutes
    slots.push({ kind: 'downtime', id: 'downtime', start, end: start + trip.downtime.minutes, travel })
    walkKm += travel.walkKm
    if (base) pos = base
    cursor = start + trip.downtime.minutes
    downtimeDone = true
  }
  const maybeDowntime = (lastId: string) => {
    if (downtimeDone) return
    if (afterKnown ? after === lastId : lunchDone && cursor >= 12 * 60 + 30 && cursor < 17 * 60) addDowntime()
  }
  const addLunch = () => {
    const start = Math.max(cursor, 12 * 60)
    slots.push({ kind: 'lunch', id: 'lunch', start, end: start + LUNCH_MIN, travel: { minutes: 0, walkKm: 0, mode: 'walk', km: 0 }, wait: start - cursor || undefined })
    cursor = start + LUNCH_MIN
    lunchDone = true
    maybeDowntime('lunch')
  }

  if (after === '^' && wantDowntime && list.length) addDowntime()

  // Far from the destination (the flight from home, a hotel booked elsewhere): it keeps its time
  // on the day, but adds no travel or walking and doesn't move where you are.
  const far = (p: Point) => trip.dest.lat !== 0 && km(trip.dest, p) > FAR_KM
  for (const p of list) {
    // No meal coming and it's lunchtime: keep a lunch break before going on.
    if (!lunchDone && p.kind !== 'meal' && cursor >= 12 * 60 + 15 && cursor < LUNCH[1]) addLunch()
    const away = far(p)
    const travel = away ? { minutes: 0, walkKm: 0, mode: 'walk' as const, km: 0 } : leg(pos, p, kids)
    const arrive = cursor + travel.minutes
    let start = arrive
    let warn: string | undefined
    const h = hoursOn(p, date)
    if (p.fixed != null) {
      start = p.fixed
      if (arrive > p.fixed + 5) warn = `About ${arrive - p.fixed} min late for the booking`
    } else {
      if (p.kind === 'meal') {
        if (arrive < LUNCH[0]) start = LUNCH[0]
        else if (arrive > LUNCH[1] - 30 && arrive < DINNER_FROM) start = DINNER_FROM
      }
      if (h === null) warn = `Closed on ${WEEKDAY_LONG[weekday(date)]}s`
      else if (h) {
        if (start < h[0]) start = h[0]
        if (start >= h[1]) warn = `Closed by then (closes ${clock(h[1])})`
        else if (start + p.minutes > h[1] + 10) warn = `Closes at ${clock(h[1])}`
      }
    }
    const wait = Math.max(0, start - arrive)
    slots.push({ kind: 'place', id: p.id, place: p, start, end: start + p.minutes, travel, warn, wait: wait || undefined })
    walkKm += travel.walkKm
    if (!away) pos = p
    cursor = start + p.minutes
    if (p.kind === 'meal' && start >= LUNCH[0] && start < LUNCH[1]) lunchDone = true
    maybeDowntime(p.id)
  }
  if (list.length && !lunchDone && cursor >= 12 * 60 + 15 && cursor < LUNCH[1]) addLunch()
  if (list.length && base) walkKm += leg(pos, base, kids).walkKm

  const limit = groupLimit(trip).miles
  const walkMi = Math.round(miles(walkKm) * 10) / 10
  const late = list.length > 0 && cursor > trip.dayEnd + 10
  const issues: string[] = []
  for (const s of slots) if (s.warn && s.place) issues.push(`${s.place.name}: ${s.warn}`)
  if (late) issues.push(`Runs until ${clock(cursor)} (your day ends ${clock(trip.dayEnd)})`)
  if (walkMi > limit) issues.push(`Walking ${walkMi} mi, over your ${limit} mi limit`)
  return { day, date, slots, walkMi, limitMi: limit, over: walkMi > limit, end: cursor, late, issues }
}

export function planAll(trip: Trip, all: Place[], metas: Record<string, DayMeta>): DayPlan[] {
  return Array.from({ length: tripDays(trip) }, (_, i) => planDay(trip, i + 1, all, metas[`${trip.id}:${i + 1}`]))
}

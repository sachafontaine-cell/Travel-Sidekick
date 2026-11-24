// The day planner: plain code, instant, and the same for Days, Today, Rebalance and Ask.
// Times are never stored: they are worked out from the order, bookings, opening hours, meals,
// downtime and walking, every time something changes.
import type { DayMeta, Place, Trip } from './model'
import { km, leg as estimate, miles, type Leg, type Point } from './geo'
import { knownLeg } from './legs'

/** Google Maps time between two places when known, else the app's estimate. */
const leg = (a: Point | undefined, b: Point | undefined, kids: boolean): Leg => knownLeg(a, b, kids) ?? estimate(a, b, kids)
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
  // Saved before hours were read carefully: "closed" all week means unknown.
  if (p.hours.week.every((x) => x === null)) return undefined
  return p.hours.week[weekday(date)] ?? null
}

export function closedDays(p: Place): string[] {
  if (!p.hours?.week) return []
  return p.hours.week.map((h, i) => (h ? '' : WEEKDAY_LONG[i].slice(0, 3))).filter(Boolean)
}

/**
 * Opening hours against when you'd be there: closed that day, before opening, after closing,
 * leaving before you're done, or starting so late that last entry may already be over.
 */
export function hoursWarning(p: Place, start: number, date: string): string | undefined {
  const h = hoursOn(p, date)
  if (h === null) return `Closed on ${WEEKDAY_LONG[weekday(date)]}s`
  if (!h) return undefined
  const [open, close] = h
  if (close >= 1440) return start < open ? `Opens at ${clock(open)}` : undefined
  if (start < open) return `Opens at ${clock(open)}`
  if (start >= close) return `Closed by then (closes ${clock(close)})`
  const left = close - start
  if (start + p.minutes > close + 5) return `Closes at ${clock(close)}: only ${left} min there`
  if (left <= 60 && p.kind !== 'meal' && p.kind !== 'snack') return `Near closing (${clock(close)}): last entry may be earlier`
  return undefined
}

export function planDay(trip: Trip, day: number, all: Place[], meta?: DayMeta): DayPlan {
  const date = dateOf(trip, day)
  const list = dayPlaces(all, day)
  const kids = youngKids(trip)
  const base: Point | undefined = trip.base
  const slots: Slot[] = []
  let pos: Point | undefined = base
  let walkKm = 0
  // Far from the destination (the flight from home, a hotel booked elsewhere): it keeps its time
  // on the day, but adds no travel or walking and doesn't move where you are.
  const far = (p: Point) => trip.dest.lat !== 0 && km(trip.dest, p) > FAR_KM
  const NO_TRAVEL: Leg = { minutes: 0, walkKm: 0, mode: 'walk', km: 0 }
  const trip_ = (from: Point | undefined, to: Place) => (far(to) ? NO_TRAVEL : leg(from, to, kids))

  // Bookings and times you set are anchors: everything else fits around them, in your order.
  const anchors = list.filter((p) => p.fixed != null).sort((a, b) => a.fixed! - b.fixed!)
  let cursor = trip.dayStart
  // A booking before the usual start pulls the day earlier.
  if (anchors[0] && anchors[0].fixed! < cursor) cursor = Math.max(0, anchors[0].fixed! - trip_(pos, anchors[0]).minutes)

  let lunchDone = false
  const wantDowntime = trip.downtime.on && trip.downtime.minutes > 0
  let downtimeDone = !wantDowntime
  const after = meta?.downtimeAfter
  const afterKnown = after === '^' || after === 'lunch' || (!!after && list.some((p) => p.id === after))
  const round5 = (m: number) => Math.ceil(m / 5) * 5

  /** Would something from `start` to `end`, ending at `at`, still leave time to reach the next anchor? */
  const fits = (end: number, at: Point | undefined) => {
    const next = anchors[0]
    return !next || end + trip_(at, next).minutes <= next.fixed! + 5
  }
  const placeAnchor = () => {
    const p = anchors.shift()
    if (!p) return
    const travel = trip_(pos, p)
    const arrive = cursor + travel.minutes
    const start = p.fixed!
    // A booking's own time is confirmed; a time you set yourself is checked against the hours.
    const warn = arrive > start + 5 ? `About ${arrive - start} min late for ${p.booked ? 'the booking' : 'your time'}` : p.booked ? undefined : hoursWarning(p, start, date)
    slots.push({ kind: 'place', id: p.id, place: p, start, end: start + p.minutes, travel, warn, wait: Math.max(0, start - arrive) || undefined })
    walkKm += travel.walkKm
    if (!far(p)) pos = p
    cursor = Math.max(cursor, start + p.minutes)
    if (p.kind === 'meal' && start >= LUNCH[0] && start < LUNCH[1]) lunchDone = true
    maybeDowntime(p.id)
  }
  /** Places anchors until `end` (ending at `at`) fits before the next one. */
  const makeRoom = (plan: () => { end: number; at: Point | undefined }) => { while (anchors.length && !fits(plan().end, plan().at)) placeAnchor() }

  function addDowntime() {
    makeRoom(() => { const t = leg(pos, base, kids); const s0 = round5(cursor + t.minutes); return { end: s0 + trip.downtime.minutes, at: base } })
    const travel = leg(pos, base, kids)
    const start = round5(cursor + travel.minutes)
    slots.push({ kind: 'downtime', id: 'downtime', start, end: start + trip.downtime.minutes, travel })
    walkKm += travel.walkKm
    if (base) pos = base
    cursor = start + trip.downtime.minutes
    downtimeDone = true
  }
  function maybeDowntime(lastId: string) {
    if (downtimeDone) return
    if (afterKnown ? after === lastId : lunchDone && cursor >= 12 * 60 + 30 && cursor < 17 * 60) addDowntime()
  }
  const addLunch = () => {
    makeRoom(() => ({ end: round5(Math.max(cursor, 12 * 60)) + LUNCH_MIN, at: pos }))
    if (lunchDone) return
    const start = round5(Math.max(cursor, 12 * 60))
    slots.push({ kind: 'lunch', id: 'lunch', start, end: start + LUNCH_MIN, travel: NO_TRAVEL, wait: start - cursor || undefined })
    cursor = start + LUNCH_MIN
    lunchDone = true
    maybeDowntime('lunch')
  }
  const lunchTime = () => !lunchDone && cursor >= 12 * 60 + 15 && cursor < LUNCH[1]

  /** When a flexible stop would start (opening hours, meal times) and any warning. */
  const timing = (p: Place) => {
    const travel = trip_(pos, p)
    const arrive = cursor + travel.minutes
    let start = round5(arrive)
    let warn: string | undefined
    const h = hoursOn(p, date)
    if (p.kind === 'meal') {
      if (arrive < LUNCH[0]) start = LUNCH[0]
      else if (arrive > LUNCH[1] - 30 && arrive < DINNER_FROM) start = DINNER_FROM
    }
    if (h && start < h[0]) start = h[0]
    warn = hoursWarning(p, start, date)
    return { travel, arrive, start, warn }
  }

  if (after === '^' && wantDowntime && list.length) addDowntime()

  // Your order, kept where time allows: a booking is placed when its turn comes (with any earlier
  // bookings first); a stop that would make you late for the next booking goes after it instead.
  for (const p of list) {
    if (p.fixed != null) {
      if (!anchors.includes(p)) continue
      while (anchors.length && anchors[0].fixed! <= p.fixed) {
        // Lunch first when it fits before this booking (lunch can bring downtime, which can place bookings: look again).
        if (lunchTime() && anchors[0].kind !== 'meal' && fits(round5(Math.max(cursor, 12 * 60)) + LUNCH_MIN, pos)) { addLunch(); continue }
        placeAnchor()
      }
      continue
    }
    // No meal coming and it's lunchtime: keep a lunch break before going on.
    if (p.kind !== 'meal' && lunchTime()) addLunch()
    makeRoom(() => { const t = timing(p); return { end: t.start + p.minutes, at: far(p) ? pos : p } })
    if (p.kind !== 'meal' && lunchTime()) addLunch()
    const { travel, arrive, start, warn } = timing(p)
    slots.push({ kind: 'place', id: p.id, place: p, start, end: start + p.minutes, travel, warn, wait: Math.max(0, start - arrive) || undefined })
    walkKm += travel.walkKm
    if (!far(p)) pos = p
    cursor = start + p.minutes
    if (p.kind === 'meal' && start >= LUNCH[0] && start < LUNCH[1]) lunchDone = true
    maybeDowntime(p.id)
  }
  // Bookings after everything else, with lunch and downtime still fitted in their gaps.
  while (anchors.length) {
    if (lunchTime() && anchors[0].kind !== 'meal' && fits(round5(Math.max(cursor, 12 * 60)) + LUNCH_MIN, pos)) { addLunch(); continue }
    placeAnchor()
  }
  if (list.length && lunchTime()) addLunch()
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

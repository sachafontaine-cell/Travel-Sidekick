import { describe, expect, it } from 'vitest'
import { between, spread } from './rank'
import { minus, plus } from './vibes'
import { demoTrip } from './demo'
import { planAll, planDay, dayIndex, tripDays } from './planner'
import { countdown, mustInfo } from './musts'
import { rebalance, slotBookings } from './rebalance'
import { gapNow, ideas } from './whatnow'
import { groupLimit, suggestedMiles } from './people'
import { clock, weekday } from './time'
import type { Place } from './model'

describe('rank keys', () => {
  it('always fits a key between two others', () => {
    let keys = spread(5)
    for (let i = 0; i < 200; i++) {
      const at = i % (keys.length - 1)
      const k = between(keys[at], keys[at + 1])
      expect(k > keys[at] && k < keys[at + 1]).toBe(true)
      keys = [...keys.slice(0, at + 1), k, ...keys.slice(at + 1)]
    }
    expect(between(undefined, keys[0]) < keys[0]).toBe(true)
    expect(between(keys.at(-1), undefined) > keys.at(-1)!).toBe(true)
    const s = spread(40)
    expect([...s].sort()).toEqual(s)
  })
})

describe('vibes', () => {
  it('always totals 100: + takes from the biggest, − gives to the biggest', () => {
    let s = plus({}, 'cultural')
    expect(s).toEqual({ cultural: 100 })
    s = plus(s, 'family')
    expect(s).toEqual({ cultural: 90, family: 10 })
    s = plus(plus(s, 'family'), 'food')
    expect(s).toEqual({ cultural: 70, family: 20, food: 10 })
    s = minus(s, 'food')
    expect(s).toEqual({ cultural: 80, family: 20 })
    expect(plus({ cultural: 100 }, 'cultural')).toEqual({ cultural: 100 })
    expect(minus({ cultural: 100 }, 'cultural')).toEqual({})
    const total = (x: object) => Object.values(x).reduce((a: number, n) => a + (n as number), 0)
    expect(total(plus({ cultural: 50, family: 30, food: 20 }, 'nature'))).toBe(100)
  })
})

describe('people', () => {
  it('suggests miles by age and uses the lowest for the group', () => {
    expect(suggestedMiles(8)).toEqual([4, 6])
    expect(suggestedMiles(42)).toEqual([8, 10])
    const { trip } = demoTrip()
    expect(groupLimit(trip)).toEqual({ miles: 6, who: 'Mia' })
  })
})

describe('day planner (sample Paris trip)', () => {
  const { trip, places } = demoTrip()
  it('knows the trip days', () => {
    expect(tripDays(trip)).toBe(7)
    expect(dayIndex(trip, '2026-06-14')).toBe(3)
    expect(dayIndex(trip, '2026-06-01')).toBe(0)
    expect(weekday('2026-06-15')).toBe(1) // Day 4 is a Monday
  })
  it('keeps bookings, lunch, downtime after lunch and dinner time', () => {
    const d3 = planDay(trip, 3, places)
    const names = d3.slots.map((s) => s.place?.name ?? s.kind)
    expect(names).toEqual(['Louvre (highlights tour)', 'Lunch · Le Fumoir', 'downtime', 'Sainte-Chapelle', 'Dinner · Bouillon Chartier'])
    expect(clock(d3.slots[0].start)).toBe('9:30 AM')
    expect(clock(d3.slots[1].start)).toBe('12:45 PM')
    expect(d3.slots[2].start).toBeGreaterThanOrEqual(d3.slots[1].end)
    expect(d3.slots[2].end - d3.slots[2].start).toBe(90)
    expect(d3.slots[4].start).toBe(18 * 60 + 30) // dinner waits for dinner time
    expect(d3.issues).toEqual([])
    expect(d3.walkMi).toBeLessThan(d3.limitMi)
  })
  it('adds a lunch break when no meal is planned', () => {
    const d4 = planDay(trip, 4, places)
    expect(d4.slots.some((s) => s.kind === 'lunch')).toBe(true)
  })
  it('flags a place on its closing day', () => {
    const orsay = places.find((p) => p.name === "Musée d'Orsay")!
    const moved = places.map((p) => (p.id === orsay.id ? { ...p, day: 4, dayRank: 'z' } : p))
    const d4 = planDay(trip, 4, moved)
    expect(d4.slots.find((s) => s.id === orsay.id)?.warn).toBe('Closed on Mondays')
    expect(d4.issues.length).toBeGreaterThan(0)
  })
  it('puts downtime where it was dragged', () => {
    const d3 = planDay(trip, 3, places, { id: 'x', trip: trip.id, day: 3, downtimeAfter: places.find((p) => p.name === 'Sainte-Chapelle')!.id, at: 0 })
    expect(d3.slots.map((s) => s.kind)).toEqual(['place', 'place', 'place', 'downtime', 'place'])
  })
})

describe('must-sees, rebalance and what now', () => {
  const { trip, places } = demoTrip()
  const plans = planAll(trip, places, {})
  it('counts down and flags the unplanned one', () => {
    const infos = mustInfo(trip, places, plans, 3, 11 * 60 + 40)
    const c = countdown(trip, infos, 3)
    expect(c).toMatchObject({ done: 4, total: 9, daysLeft: 4 })
    const orsay = infos.find((i) => i.place.name === "Musée d'Orsay")!
    expect(orsay.state).toBe('risk')
    expect(infos.find((i) => i.place.name.startsWith('Louvre'))!.line).toBe('Was planned at 9:30 AM. Done?')
  })
  it('rebalance saves the at-risk must-see on an open day without breaking any day', () => {
    const r = rebalance(trip, places, {}, 3, 11 * 60 + 40)
    const orsay = r.changes.find((c) => c.name === "Musée d'Orsay")!
    expect(orsay.to.day).not.toBeNull()
    expect(orsay.to.day).not.toBe(4) // closed Mondays
    expect(orsay.to.day!).toBeGreaterThan(3)
    const after: Place[] = places.map((p) => r.places.find((x) => x.id === p.id) ?? p)
    for (let d = 4; d <= 7; d++) {
      const pl = planDay(trip, d, after)
      expect(pl.late || pl.over).toBe(false)
      expect(pl.slots.filter((s) => s.warn)).toEqual([])
    }
  })
  it('suggests a short rest stop that fits before the lunch booking', () => {
    const gap = gapNow(trip, plans[2], 11 * 60 + 40)
    expect(gap.next?.place?.name).toBe('Lunch · Le Fumoir')
    const list = ideas(trip, places, '2026-06-14', 11 * 60 + 40, gap, 'tired')
    expect(list[0]?.place.name).toBe('Tuileries Garden')
  })
})

describe('bookings from email', () => {
  it('a dinner booking that arrives first in the list is slotted at dinner time, nothing else moves', () => {
    const { trip, places } = demoTrip()
    const dinner = { ...places.find((p) => p.name.startsWith('Dinner'))!, id: 'mail-1', day: 5, dayRank: 'a1ati', fixed: 19 * 60, booked: 'Booked · from your email' }
    const all = [...places, dinner]
    const moved = slotBookings(trip, all)
    expect(moved.map((p) => p.id)).toEqual(['mail-1'])
    const after = all.map((p) => moved.find((m) => m.id === p.id) ?? p)
    const plan = planDay(trip, 5, after)
    expect(plan.slots.filter((s) => s.place).map((s) => s.place!.name).at(-1)).toBe(dinner.name)
    expect(plan.slots.find((s) => s.place?.name === 'Montmartre + Sacré-Cœur')!.start).toBeLessThan(12 * 60)
    expect(plan.slots.find((s) => s.id === 'mail-1')!.warn).toBeUndefined()
    // Slotted once: the next sync must not move it again (no endless re-saving).
    expect(slotBookings(trip, after)).toEqual([])
  })
  it('a booking far away (the flight from home) does not drag the day across the world', () => {
    const { trip, places } = demoTrip()
    const flight = { ...places[0], id: 'fl', name: 'Flight to Paris', kind: 'other' as const, lat: 32.7338, lng: -117.1933, day: 1, dayRank: 'a', fixed: 8 * 60, minutes: 60, must: false, booked: 'Booked · from your email', hours: undefined }
    const plan = planDay(trip, 1, [...places, flight])
    expect(plan.issues).toEqual([])
    expect(plan.walkMi).toBeLessThan(plan.limitMi)
    expect(plan.slots.find((s) => s.place?.name === 'Arc de Triomphe')!.start).toBeLessThan(14 * 60)
  })
})

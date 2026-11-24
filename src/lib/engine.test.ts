import { describe, expect, it } from 'vitest'
import { between, spread } from './rank'
import { minus, plus } from './vibes'
import { demoTrip } from './demo'
import { planAll, planDay, dayIndex, tripDays, hoursOn } from './planner'
import { countdown, mustInfo } from './musts'
import { planChecked, rebalance, slotBookings } from './rebalance'
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
    expect(clock(d3.slots[0].start)).toBe('9:30')
    expect(clock(d3.slots[1].start)).toBe('12:45')
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
    expect(infos.find((i) => i.place.name.startsWith('Louvre'))!.line).toBe('Was planned at 9:30. Done?')
  })
  it('Plan my days fits checked places, drops unchecked ones, keeps today and before', () => {
    const tuileries = places.find((p) => p.name === 'Tuileries Garden')!
    const onLater = places.find((p) => p.day != null && p.day > 3 && p.fixed == null && !p.must)!
    const today = places.filter((p) => p.day === 3)
    const input = places.map((p) => p.id === tuileries.id ? { ...p, status: 'picked' as const, day: null } : p.id === onLater.id ? { ...p, status: 'maybe' as const } : p)
    const r = planChecked(trip, input, {}, 4)
    const after: Place[] = input.map((p) => r.places.find((x) => x.id === p.id) ?? p)
    expect(after.find((p) => p.id === onLater.id)!.day).toBeNull()
    expect(after.find((p) => p.id === tuileries.id)!.day).toBeGreaterThanOrEqual(4)
    expect(r.removed).toBe(1)
    for (const p of today) expect(after.find((x) => x.id === p.id)!.day).toBe(3)
    for (let d = 4; d <= 7; d++) { const pl = planDay(trip, d, after); expect(pl.late || pl.over).toBe(false) }
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

describe('bookings are anchors: the day stays in time order', () => {
  const { trip, places } = demoTrip()
  // A Cabo-like day: one stop in the morning, a 13:00 snorkel booking, lunch and a long downtime.
  const t = { ...trip, downtime: { on: true, minutes: 150 } }
  const near = { lat: trip.base!.lat + 0.01, lng: trip.base!.lng }
  const morning = { ...places[0], id: 'm', name: 'Acre Baja', ...near, day: 4, dayRank: 'a', fixed: null, booked: undefined, hours: undefined, minutes: 120, kind: 'sight' as const }
  const snorkel = { ...places[0], id: 's', name: 'Santa Maria Bay Snorkeling', lat: near.lat + 0.01, lng: near.lng, day: 4, dayRank: 'z', fixed: 13 * 60, booked: 'Booked', hours: undefined, minutes: 180, kind: 'tour' as const }
  const plan = planDay(t, 4, [morning, snorkel])
  it('lists everything in time order, nothing overlapping', () => {
    const starts = plan.slots.map((s) => s.start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    for (let i = 1; i < plan.slots.length; i++) expect(plan.slots[i].start).toBeGreaterThanOrEqual(plan.slots[i - 1].end)
  })
  it('keeps the booking at its time, on time', () => {
    const s = plan.slots.find((x) => x.id === 's')!
    expect(clock(s.start)).toBe('13:00')
    expect(s.warn).toBeUndefined()
  })
  it('fits lunch and downtime around the booking, not across it', () => {
    const s = plan.slots.find((x) => x.id === 's')!
    for (const k of ['lunch', 'downtime']) {
      const x = plan.slots.find((y) => y.kind === k)
      if (x) expect(x.end <= s.start || x.start >= s.end).toBe(true)
    }
  })
})

describe('planner never goes back in time (random days)', () => {
  it('3000 random days: times always go forward; overlaps only between clashing bookings', () => {
    const { trip, places } = demoTrip()
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const bad: string[] = []
    for (let k = 0; k < 3000; k++) {
      const n = 1 + Math.floor(rnd() * 6)
      const day = places.slice(0, 12).sort(() => rnd() - 0.5).slice(0, n).map((p, i) => ({
        ...p, id: `r${i}`, day: 2, dayRank: String.fromCharCode(97 + Math.floor(rnd() * 26)) + i,
        fixed: rnd() < 0.35 ? (8 + Math.floor(rnd() * 12)) * 60 + (rnd() < 0.5 ? 30 : 0) : null,
        booked: undefined, done: false, minutes: 30 + Math.floor(rnd() * 8) * 15,
        lat: trip.dest.lat + (rnd() - 0.5) * 0.1, lng: trip.dest.lng + (rnd() - 0.5) * 0.1,
      }))
      const t = { ...trip, downtime: { on: rnd() < 0.6, minutes: 60 + Math.floor(rnd() * 4) * 30 } }
      const plan = planDay(t, 2, day)
      for (let i = 1; i < plan.slots.length; i++) {
        const a = plan.slots[i - 1], b = plan.slots[i]
        const clash = b.place?.fixed != null && b.warn?.includes('late for the booking')
        if (b.start < a.start || (b.start < a.end && !clash)) bad.push(`${clock(a.start)}-${clock(a.end)} ${a.id} then ${clock(b.start)} ${b.id}`)
      }
      for (const s of plan.slots) if (s.place?.fixed != null && s.start !== s.place.fixed) bad.push(`booking moved ${s.id}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
  })
})

describe('the Cabo day from the screenshot', () => {
  it('snorkel at 11:00, your own 14:00 for Acre Baja, then Flora Farms: in order, downtime after', () => {
    const { trip, places } = demoTrip()
    const t = { ...trip, downtime: { on: true, minutes: 150 } }
    const b = trip.base!
    const mk = (id: string, name: string, dLat: number, fixed: number | null, minutes: number, rank: string, booked?: string) => ({ ...places[0], id, name, lat: b.lat + dLat, lng: b.lng, day: 5, dayRank: rank, fixed, booked, hours: undefined, minutes, kind: 'sight' as const, must: false })
    const plan = planDay(t, 5, [mk('s', 'Snorkel', 0.05, 11 * 60, 165, 'a'), mk('a', 'Acre Baja', 0.06, 14 * 60, 120, 'b'), mk('f', 'Flora Farms', 0.065, null, 120, 'c')])
    const starts = plan.slots.map((s) => s.start)
    expect([...starts].sort((x, y) => x - y)).toEqual(starts)
    expect(clock(plan.slots.find((s) => s.id === 'a')!.start)).toBe('14:00')
    const dt = plan.slots.find((s) => s.kind === 'downtime')
    if (dt) expect(dt.start).toBeGreaterThanOrEqual(plan.slots.find((s) => s.id === 'a')!.end)
  })
})

describe('real travel times between stops', () => {
  it('uses the Google Maps time once known (and says so), else the estimate', async () => {
    const { realLegs, legKey } = await import('./legs')
    const { trip, places } = demoTrip()
    const b = trip.base!
    const a = { ...places[0], id: 'x', lat: b.lat + 0.05, lng: b.lng, day: 2, dayRank: 'a', fixed: null, booked: undefined, hours: undefined, minutes: 60 }
    const c = { ...places[0], id: 'y', lat: b.lat + 0.06, lng: b.lng + 0.02, day: 2, dayRank: 'b', fixed: null, booked: undefined, hours: undefined, minutes: 60 }
    const before = planDay(trip, 2, [a, c]).slots.find((s) => s.id === 'y')!.travel
    expect(before.real).toBeFalsy()
    realLegs.set({ [legKey(a, c)]: { walk: 70, car: 31, km: 3.1 } })
    const after = planDay(trip, 2, [a, c]).slots.find((s) => s.id === 'y')!.travel
    expect(after).toMatchObject({ minutes: 31, mode: 'car', real: true })
    realLegs.set({})
  })
})

describe('opening hours from Gemini', () => {
  it('reads AM/PM and 24 hours; anything unreadable is unknown, never "closed"', async () => {
    const { parseHours } = await import('./ai')
    expect(parseHours(Array(7).fill('8:00 AM - 5:00 PM'))?.week[1]).toEqual([480, 1020])
    expect(parseHours(Array(7).fill('Open 24 hours'))?.week[0]).toEqual([0, 1440])
    expect(parseHours(Array(7).fill('Tours at 8:00 and 12:00'))).toBeUndefined()
    expect(parseHours(Array(7).fill('closed'))).toBeUndefined()
    expect(parseHours(['closed', ...Array(6).fill('09:00-17:00')])?.week[0]).toBeNull()
  })
  it('a place saved as closed all week counts as unknown', () => {
    const p = { hours: { week: Array(7).fill(null), source: 'ai' } } as unknown as Place
    expect(hoursOn(p, '2026-11-25')).toBeUndefined()
  })
})

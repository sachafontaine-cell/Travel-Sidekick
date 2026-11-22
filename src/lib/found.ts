// Trips and bookings the family script found in email arrive through sync. Here they're
// finished on the phone: currency, language and your family for a found trip; each new booking
// slotted into the best spot of its day. Saved once, so it syncs to the other phone too.
import type { Place, Trip } from './model'
import type { Booking, FoundTrip } from './sync'
import { newTrip } from './actions'
import { dayIndex, tripDays } from './planner'
import { parseClock } from './time'
import { days, places, save, trips, tripPlaces, type Rec } from './data'
import { currencyOf, langOf } from './money'
import { defaultFamily } from './people'
import { slotBookings } from './rebalance'

export function afterMerge(incoming: Rec[]) {
  const tripIds = new Set<string>()
  for (const r of incoming) {
    if (r.coll === 'trip' && r.data) tripIds.add(r.id)
    if (r.coll === 'place' && r.data) tripIds.add((r.data as Place).trip)
  }
  for (const id of tripIds) {
    const t = trips.get()[id]
    if (!t) continue
    if (t.found && (!t.dest.currency || !t.people.length)) {
      const others = Object.values(trips.get()).filter((x) => x.id !== t.id)
      const done: Trip = {
        ...t,
        dest: { ...t.dest, currency: t.dest.currency || currencyOf(t.dest.country), lang: t.dest.lang || langOf(t.dest.country) },
        people: t.people.length ? t.people : defaultFamily(others, t.start),
      }
      save('trip', [done])
    }
    const moved = slotBookings(trips.get()[id], tripPlaces(id), days.get())
    if (moved.length) save('place', moved)
  }
  void places
}

/** A booking as a stop at its booked time (slotted into the day by slotBookings). */
export function placeFromBooking(b: Booking, trip: Trip): Place | null {
  const day = dayIndex(trip, b.date)
  if (b.kind === 'hotel' || b.lat == null || b.lng == null || day < 1 || day > tripDays(trip)) return null
  const fixed = b.time ? parseClock(b.time) : null
  const key = 'a' + (1000 + (fixed ?? 0)).toString(36) + 'i'
  return {
    id: crypto.randomUUID(), trip: trip.id, name: b.name, kind: b.kind === 'meal' ? 'meal' : 'other', lat: b.lat, lng: b.lng, badge: 'worth', must: false,
    worth: 7, value: 7, sub: { iconic: 5, vibe: 5, hassle: 5, kid: 5 }, rec: 'pay', recText: 'Already booked.', why: b.note ?? '', tip: '',
    price: 0, minutes: b.kind === 'flight' ? 60 : 90, suggested: 90, indoor: true, status: 'picked', rank: key, day, dayRank: key, fixed, booked: 'Booked · from your email', at: Date.now(),
  }
}

/** "Add" on a found trip: the trip (with your family, its hotel as base) and its bookings. */
export function addFound(f: FoundTrip): Trip {
  const t = newTrip()
  const hotel = f.bookings.find((b) => b.kind === 'hotel' && b.lat != null && b.lng != null)
  const trip: Trip = {
    ...t, name: f.dest.name.split(',')[0], found: 'email', start: f.start, end: f.end,
    dest: { ...f.dest, currency: f.dest.currency || currencyOf(f.dest.country), lang: f.dest.lang || langOf(f.dest.country) },
    base: hotel ? { name: hotel.name, lat: hotel.lat!, lng: hotel.lng! } : undefined,
  }
  save('trip', [trip])
  const stops = f.bookings.map((b) => placeFromBooking(b, trip)).filter((p): p is Place => !!p)
  if (stops.length) {
    save('place', stops)
    const moved = slotBookings(trip, tripPlaces(trip.id), days.get())
    if (moved.length) save('place', moved)
  }
  return trip
}

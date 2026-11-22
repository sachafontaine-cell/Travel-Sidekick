// Trips and bookings the family script found in email arrive through sync. Here they're
// finished on the phone: currency, language and your family for a found trip; each new booking
// slotted into the best spot of its day. Saved once, so it syncs to the other phone too.
import type { Place, Trip } from './model'
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

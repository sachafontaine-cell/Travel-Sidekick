// Walking limits by age, the group limit, and the kid buffer. Suggestions appear in parentheses.
import type { Pace, Person, Trip } from './model'

/** Suggested miles per day for an age: [low, high]. */
export function suggestedMiles(age: number): [number, number] {
  if (age < 5) return [1, 2]
  if (age < 13) return [4, 6]
  if (age < 18) return [6, 8]
  if (age < 65) return [8, 10]
  return [5, 7]
}

const PACE_FACTOR: Record<Pace, number> = { slow: 0.8, balanced: 1, packed: 1.15 }

export const milesFor = (p: Person) => p.miles ?? suggestedMiles(p.age)[1]

/** The group walks as far as its most limited member. */
export function groupLimit(trip: Pick<Trip, 'people' | 'pace'>): { miles: number; who?: string } {
  if (!trip.people.length) return { miles: 8 * PACE_FACTOR[trip.pace] }
  let low = trip.people[0]
  for (const p of trip.people) if (milesFor(p) < milesFor(low)) low = p
  return { miles: Math.round(milesFor(low) * PACE_FACTOR[trip.pace] * 10) / 10, who: low.name }
}

export const youngKids = (trip: Pick<Trip, 'people'>) => trip.people.some((p) => p.age < 10)

/** Extra minutes before leaving with kids (shoes, bathrooms, snacks). */
export const kidBuffer = (trip: Pick<Trip, 'people'>) => (youngKids(trip) ? 8 : trip.people.some((p) => p.age < 13) ? 5 : 2)

/** Pace sets the defaults for the day shape; anything changed by hand stays. */
export const PACE_DEFAULTS: Record<Pace, { dayStart: number; dayEnd: number; downtime: number }> = {
  slow: { dayStart: 600, dayEnd: 1230, downtime: 120 },
  balanced: { dayStart: 540, dayEnd: 1260, downtime: 90 },
  packed: { dayStart: 480, dayEnd: 1320, downtime: 60 },
}

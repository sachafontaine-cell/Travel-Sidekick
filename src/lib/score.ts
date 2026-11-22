// "Worth it" is worked out from the bars shown under "Why 9?", so the two always agree.
import type { Place, Trip } from './model'

export const hasKids = (trip: Pick<Trip, 'people'>) => trip.people.some((x) => x.age < 13)

/** [label, weight] per bar; with no kids on the trip, Kid fit doesn't count. */
export function weights(kids: boolean): [string, number][] {
  return kids
    ? [['Iconic', 0.3], ['Vibe fit', 0.3], ['Value', 0.15], ['Kid fit', 0.15], ['Low hassle', 0.1]]
    : [['Iconic', 0.35], ['Vibe fit', 0.35], ['Value', 0.18], ['Low hassle', 0.12]]
}

export function worthOf(p: Pick<Place, 'value' | 'sub'>, kids: boolean): number {
  const v: Record<string, number> = { Iconic: p.sub.iconic, 'Vibe fit': p.sub.vibe, Value: p.value, 'Kid fit': p.sub.kid, 'Low hassle': p.sub.hassle }
  const s = weights(kids).reduce((a, [k, w]) => a + v[k] * w, 0)
  return Math.round(s * 2) / 2
}

/** Places scored before this rule: their score is redone from their bars (once). */
export function rescore(trip: Trip, list: Place[]): Place[] {
  const kids = hasKids(trip)
  return list.filter((p) => p.scoreV !== 2 && !p.scoring && p.sub).map((p) => ({ ...p, worth: worthOf(p, kids), scoreV: 2 as const }))
}

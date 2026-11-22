// Descriptions written for your group, plus "great for" and "skip if", fetched when needed
// (a card opens, or Decide is about to show a place), a few places per request.
import { places, save, settings } from './data'
import { describeMany, groupKey } from './ai'
import type { Place, Trip } from './model'

const asked = new Set<string>()
export const needsAbout = (trip: Trip, p: Place) => !p.scoring && !(p.booked && p.kind === 'other') && (!p.desc || !p.good || p.descFor !== groupKey(trip))

export async function fillAbout(trip: Trip, list: Place[]): Promise<void> {
  if (!settings.get().geminiKey) return
  const key = groupKey(trip)
  const todo = list.filter((p) => needsAbout(trip, p) && !asked.has(p.id + key)).slice(0, 6)
  if (!todo.length) return
  todo.forEach((p) => asked.add(p.id + key))
  try {
    const got = await describeMany(trip, todo)
    const changed: Place[] = []
    for (const p of todo) {
      const a = got[p.name.toLowerCase()]
      const cur = places.get()[p.id]
      if (a?.desc && cur) changed.push({ ...cur, desc: a.desc, good: a.good ?? cur.good, skipIf: a.skipIf ?? cur.skipIf, descFor: key })
    }
    if (changed.length) save('place', changed)
  } catch { todo.forEach((p) => asked.delete(p.id + key)) } // offline or busy: try again later
}

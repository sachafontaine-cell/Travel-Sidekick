// When the vibe, budget, group, pace or food rules change, the suggestions follow: every place is
// re-scored for the new settings and a few better fits are added (unchecked, tagged "New").
// Your choices stay: checked or not, days, times, must-sees, done, bookings.
import { places, save, settings, tripPlaces, trips } from './data'
import { createStore } from './store'
import { listKey, rescoreList } from './ai'
import { between, byRank } from './rank'
import type { Place, Trip } from './model'

/** Trips being refreshed right now (this phone). */
export const refreshing = createStore<Record<string, 'busy' | string>>({})

export const stale = (t: Trip) => !!t.built && t.listFor != null && t.listFor !== listKey(t)

export async function refreshList(id: string): Promise<void> {
  const t = trips.get()[id]
  if (!t || !stale(t) || refreshing.get()[id] === 'busy' || !settings.get().geminiKey) return
  refreshing.set({ ...refreshing.get(), [id]: 'busy' })
  const key = listKey(t)
  const mine = tripPlaces(id).filter((p) => !p.booked && !p.scoring)
  const byName = new Map(mine.map((p) => [p.name.toLowerCase(), p]))
  let rank = tripPlaces(id).sort(byRank).at(-1)?.rank
  let added = 0
  try {
    await rescoreList(t, mine.map((p) => p.name), (n) => {
      const old = byName.get(n.name.toLowerCase())
      if (old) {
        const cur = places.get()[old.id] ?? old
        const keepMinutes = cur.minutes !== cur.suggested
        const next: Place = {
          ...cur, kind: n.kind, badge: n.badge, worth: n.worth, value: n.value, sub: n.sub, rec: n.rec, recText: n.recText, why: n.why, tip: n.tip,
          desc: n.desc ?? cur.desc, descFor: n.desc ? n.descFor : cur.descFor, suggested: n.minutes, minutes: keepMinutes ? cur.minutes : n.minutes,
          hours: cur.hours?.source === 'google' ? cur.hours : n.hours ?? cur.hours, scoreV: 2,
        }
        save('place', [next])
        byName.delete(n.name.toLowerCase())
      } else if (!tripPlaces(id).some((x) => x.name.toLowerCase() === n.name.toLowerCase()) && added < 8 && n.badge !== 'trap') {
        rank = between(rank, undefined)
        save('place', [{ ...n, rank, status: 'maybe', must: false, fresh: true }])
        added++
      }
    })
    save('trip', [{ ...trips.get()[id], listFor: key }], added ? `Suggestions updated · ${added} new` : 'Suggestions updated')
    refreshing.set({ ...refreshing.get(), [id]: '' })
  } catch (e) {
    refreshing.set({ ...refreshing.get(), [id]: e instanceof Error ? e.message : 'Could not update the suggestions.' })
  }
}

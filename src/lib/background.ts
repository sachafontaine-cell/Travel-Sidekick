// Quiet work while the app is open: exchange rate, weather, must-see hours, local rules.
// Nothing here blocks a screen; results just appear.
import { DEMO } from './store'
import { places, save, settings, trips, tripPlaces, nowIn } from './data'
import { route } from './nav'
import { fetchRate } from './money'
import { refreshWeather } from './weather'
import { checkHours, localRules } from './ai'
import { dateOf, tripDays } from './planner'
import type { Place, Trip } from './model'

const busy = new Set<string>()
async function once(key: string, job: () => Promise<void>) {
  if (busy.has(key)) return
  busy.add(key)
  try { await job() } catch { /* try again next time */ } finally { busy.delete(key) }
}

/** Must-sees planned today and the next 2 days get their hours checked with Google each morning. */
async function hoursJob(trip: Trip) {
  if (DEMO || !settings.get().geminiKey) return
  const now = nowIn(trip)
  const today = Math.max(1, now.day)
  const morning = Date.now() - (now.min - 5 * 60) * 60000 // ~5 AM today, destination time
  const due: { place: Place; date: string }[] = []
  for (const p of tripPlaces(trip.id)) {
    if (!p.must || p.done || p.status === 'out' || p.day == null || p.day < today || p.day > Math.min(tripDays(trip), today + 2)) continue
    if ((p.hours?.checkedAt ?? 0) > morning && p.hours?.source === 'google') continue
    due.push({ place: p, date: dateOf(trip, p.day) })
  }
  if (!due.length) return
  const found = await checkHours(trip, due.slice(0, 8))
  const changed: Place[] = []
  for (const { place, date } of due.slice(0, 8)) {
    const k = place.id + '|' + date
    if (!found.has(k)) continue
    const cur = places.get()[place.id]
    const week = cur.hours?.week
    changed.push({ ...cur, hours: { week, dates: { ...(cur.hours?.dates ?? {}), [date]: found.get(k)! }, checkedAt: Date.now(), source: 'google' } })
  }
  if (changed.length) save('place', changed)
}

function run() {
  const r = route.get()
  if (r.name === 'trips') return
  const trip = trips.get()[r.trip]
  if (!trip || !trip.dest.tz) return
  const now = nowIn(trip)
  void once('fx' + trip.id, async () => {
    if (DEMO || trip.dest.currency === trip.home || (trip.fx && Date.now() - trip.fx.at < 12 * 3600000)) return
    const rate = await fetchRate(trip.dest.currency, trip.home)
    if (rate) save('trip', [{ ...trips.get()[trip.id], fx: { rate, at: Date.now() } }])
  })
  void once('wx' + trip.id, () => refreshWeather(trip, now.day >= 1 && now.day <= tripDays(trip) ? now.date : trip.start, Math.floor(now.min / 60)))
  void once('hours' + trip.id, () => hoursJob(trip))
  void once('rules' + trip.id, async () => {
    if (DEMO || !trip.built || trip.rules?.length || !settings.get().geminiKey) return
    const rules = await localRules(trip)
    if (rules.length) save('trip', [{ ...trips.get()[trip.id], rules }])
  })
}

export function startBackground() {
  // Let the first screen paint before any network work starts.
  setTimeout(run, 1200)
  route.subscribe(() => setTimeout(run, 300))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run() })
}

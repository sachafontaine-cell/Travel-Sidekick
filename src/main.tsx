import { render } from 'preact'
import './styles.css'
import { App } from './app'
import { DEMO } from './lib/store'
import { places, save, settings, tripPlaces, trips } from './lib/data'
import { demoTrip } from './lib/demo'
import { go, overlays, route, tripPath } from './lib/nav'
import { Plan } from './screens/plan'
import { Ideas } from './screens/ideas'
import { startUpdates, setHomeCheck } from './lib/update'
import { cursor, startSync } from './lib/sync'
import { startBackground } from './lib/background'
import { rescore } from './lib/score'
import { listKey } from './lib/ai'

// The sample trip lives in its own space and always starts fresh.
if (DEMO && !trips.get()['demo-paris']) {
  const { trip, places: ps } = demoTrip()
  trips.set({ [trip.id]: trip })
  places.set(Object.fromEntries(ps.map((p) => [p.id, p])))
  settings.set({ ...settings.get(), me: 'Alex' })
}
// Scores from before "worth = the bars" are redone once (and sync to the other phone).
for (const t of Object.values(trips.get())) {
  const re = rescore(t, tripPlaces(t.id)); if (re.length) save('place', re)
  // Lists built before refreshes existed count as up to date with today's settings.
  if (t.built && t.listFor == null) save('trip', [{ ...t, listFor: listKey(t) }])
}
if (DEMO && !location.hash.replace(/^#\/?/, '')) go(tripPath('demo-paris'), true)
// Opening the app (no screen asked for): back to the trip you were last in. Trips is one tap away.
const last = settings.get().lastTrip
if (!DEMO && !location.hash.replace(/^#\/?/, '') && last && trips.get()[last]?.built) go(tripPath(last), true)
// Remember the trip you're in.
const remember = () => { const r = route.get(); if (r.name !== 'trips' && trips.get()[r.trip] && settings.get().lastTrip !== r.trip) settings.set({ ...settings.get(), lastTrip: r.trip }) }
remember(); route.subscribe(remember)

// The family link (…/?k=KEY&api=SCRIPT_URL) is read once, kept on this phone, then hidden.
const q = new URLSearchParams(location.search)
// Only a real Apps Script web app address is accepted (not the WEB_APP_URL placeholder).
export const validApi = (u: string | null) => !!u && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u.trim())
if (q.get('k')) {
  const api = q.get('api')
  // A different family script (another Sheet): start syncing from the beginning.
  if (validApi(api) && api!.trim() !== settings.get().api) { cursor.set(0); settings.set({ ...settings.get(), keyShared: false }) }
  settings.set({ ...settings.get(), familyKey: q.get('k')!, api: validApi(api) ? api!.trim() : settings.get().api, badApi: api && !validApi(api) ? api.slice(0, 40) : undefined })
  q.delete('k'); q.delete('api')
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash)
}

render(<App />, document.getElementById('app')!)

// Speed: once the first screen is up and the phone is idle, draw Ideas and Days off-screen once
// and throw them away. The browser has then compiled that code, so the first tap on either is instant.
const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 600))
idle(() => {
  const r = route.get()
  const trip = r.name !== 'trips' ? trips.get()[r.trip] : undefined
  if (!trip?.built) return
  const box = document.createElement('div')
  try { render(<Ideas trip={trip} map={false} />, box); render(null, box); render(<Plan trip={trip} day={0} />, box) } finally { render(null, box) }
})

// A new version is applied when you leave the app, never in the middle of something.
setHomeCheck(() => overlays.get().length === 0)
startUpdates()
startSync()
startBackground()

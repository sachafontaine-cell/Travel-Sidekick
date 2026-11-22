import { render } from 'preact'
import './styles.css'
import { App } from './app'
import { DEMO } from './lib/store'
import { places, settings, trips } from './lib/data'
import { demoTrip } from './lib/demo'
import { go, overlays, route, tripPath } from './lib/nav'
import { Plan } from './screens/plan'
import { startUpdates, setHomeCheck } from './lib/update'
import { startSync } from './lib/sync'
import { startBackground } from './lib/background'

// The sample trip lives in its own space and always starts fresh.
if (DEMO && !trips.get()['demo-paris']) {
  const { trip, places: ps } = demoTrip()
  trips.set({ [trip.id]: trip })
  places.set(Object.fromEntries(ps.map((p) => [p.id, p])))
  settings.set({ ...settings.get(), me: 'Alex' })
}
if (DEMO && !location.hash.replace(/^#\/?/, '')) go(tripPath('demo-paris'), true)

// The family link (…/?k=KEY&api=SCRIPT_URL) is read once, kept on this phone, then hidden.
const q = new URLSearchParams(location.search)
// Only a real Apps Script web app address is accepted (not the WEB_APP_URL placeholder).
export const validApi = (u: string | null) => !!u && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u.trim())
if (q.get('k')) {
  const api = q.get('api')
  settings.set({ ...settings.get(), familyKey: q.get('k')!, api: validApi(api) ? api!.trim() : settings.get().api, badApi: api && !validApi(api) ? api.slice(0, 40) : undefined })
  q.delete('k'); q.delete('api')
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash)
}

render(<App />, document.getElementById('app')!)

// Speed: once the first screen is up and the phone is idle, draw the Plan screen off-screen once
// and throw it away. The browser has then compiled that code, so the first tap on Plan is instant.
const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 600))
idle(() => {
  const r = route.get()
  const trip = r.name !== 'trips' ? trips.get()[r.trip] : undefined
  if (!trip?.built) return
  const box = document.createElement('div')
  try { render(<Plan trip={trip} day={0} />, box) } finally { render(null, box) }
})

// A new version is applied when you leave the app, never in the middle of something.
setHomeCheck(() => overlays.get().length === 0)
startUpdates()
startSync()
startBackground()

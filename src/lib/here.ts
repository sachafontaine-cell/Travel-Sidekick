// Where this phone is right now (only after you ask for it: the browser asks permission once).
import { createStore } from './store'
import type { Point } from './geo'

export const here = createStore<{ pt?: Point; at?: number; error?: string; busy?: boolean }>({})

export function locate(again = false): Promise<Point | null> {
  const cur = here.get()
  if (cur.pt && Date.now() - (cur.at ?? 0) < 60000) return Promise.resolve(cur.pt)
  if (cur.busy || (cur.error && !again)) return Promise.resolve(cur.pt ?? null)
  if (!('geolocation' in navigator)) { here.set({ error: 'This phone can\'t share its location.' }); return Promise.resolve(null) }
  here.set({ ...cur, busy: true, error: undefined })
  return new Promise((done) => navigator.geolocation.getCurrentPosition(
    (p) => { const pt = { lat: p.coords.latitude, lng: p.coords.longitude }; here.set({ pt, at: Date.now() }); done(pt) },
    (e) => { here.set({ ...here.get(), busy: false, error: e.code === 1 ? 'Location is off for this app: allow it in the browser settings.' : 'Couldn\'t find your location. Try again outside.' }); done(null) },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  ))
}

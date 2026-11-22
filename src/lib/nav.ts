// Screens are hash routes; dialogs and sheets are overlays on top. Android's back button closes
// the top overlay first (each one adds a history step), then goes back a screen.
import { createStore } from './store'

export type Route =
  | { name: 'trips' }
  | { name: 'today' | 'trip' | 'setup' | 'start'; trip: string }
  | { name: 'plan'; trip: string; day: number }

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 't' && parts[1]) {
    const trip = decodeURIComponent(parts[1])
    const name = parts[2] ?? 'today'
    if (name === 'plan') return { name: 'plan', trip, day: parts[3] === 'map' ? -1 : Number(parts[3]) || 0 }
    if (name === 'today' || name === 'trip' || name === 'setup' || name === 'start') return { name, trip }
  }
  return { name: 'trips' }
}

export const overlays = createStore<Overlay[]>([])

const read = () => parse(typeof location === 'undefined' ? '' : location.hash)
export const route = createStore<Route>(read())
if (typeof addEventListener === 'function') addEventListener('hashchange', () => route.set(read()))

export function go(hash: string, replace = false) {
  overlays.set([])
  if (replace) { history.replaceState(null, '', hash); route.set(parse(hash)) }
  else location.hash = hash
}
export const tripPath = (id: string, rest = 'today') => `#/t/${encodeURIComponent(id)}/${rest}`

// ---- Overlays
export type Overlay =
  | { kind: 'card'; place: string }
  | { kind: 'ask'; place?: string }
  | { kind: 'rebalance' }
  | { kind: 'sheet'; name: string; arg?: string }


export function open(o: Overlay) {
  const next = [...overlays.get(), o]
  history.pushState({ ov: next.length }, '')
  overlays.set(next)
}
export function close() {
  if (overlays.get().length) history.back()
}
/** Swap the top overlay without a new history step (e.g. Card → Ask). */
export function replaceTop(o: Overlay) {
  const cur = overlays.get()
  overlays.set(cur.length ? [...cur.slice(0, -1), o] : [o])
  if (!cur.length) history.pushState({ ov: 1 }, '')
}
if (typeof addEventListener === 'function') {
  addEventListener('popstate', (e) => {
    const depth = (e.state as { ov?: number } | null)?.ov ?? 0
    if (overlays.get().length > depth) overlays.set(overlays.get().slice(0, depth))
  })
}

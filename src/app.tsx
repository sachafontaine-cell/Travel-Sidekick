import { Icon, UndoToast } from './ui'
import { go, open, overlays, route, tripPath } from './lib/nav'
import { trips } from './lib/data'
import { Trips } from './screens/trips'
import { Setup } from './screens/setup'
import { Start } from './screens/start'
import { Today } from './screens/today'
import { Plan } from './screens/plan'
import { Ideas } from './screens/ideas'
import { TripTab } from './screens/trip'
import { Overlays } from './screens/overlays'

export function App() {
  const r = route.use()
  const all = trips.use()
  overlays.use()
  const trip = r.name !== 'trips' ? all[r.trip] : undefined
  if (r.name !== 'trips' && !trip) return <div class="shell"><Trips /><Overlays /></div>

  const tabbed = r.name === 'today' || r.name === 'plan' || r.name === 'ideas' || r.name === 'trip'
  const screen = r.name === 'trips' ? <Trips />
    : r.name === 'setup' ? <Setup trip={trip!} />
    : r.name === 'start' ? <Start trip={trip!} />
    : r.name === 'today' ? <Today trip={trip!} />
    : r.name === 'plan' ? <Plan trip={trip!} day={r.day} />
    : r.name === 'ideas' ? <Ideas trip={trip!} map={r.map} />
    : <TripTab trip={trip!} />

  const tabs = [
    ['today', 'today', 'Today', Icon.sun], ['ideas', 'ideas', 'Ideas', Icon.bulb], ['plan', 'plan', 'Days', Icon.plan], ['trip', 'trip', 'Trip', Icon.bag],
  ] as const
  return (
    <div class="shell">
      {screen}
      {r.name === 'today' && (
        <button class="fab press" onClick={() => open({ kind: 'ask' })}><Icon.chat />Ask</button>
      )}
      {tabbed && (
        <nav class="tabbar" aria-label="Sections">
          {tabs.map(([name, path, label, I]) => (
            <button class={`tab press${r.name === name ? ' on' : ''}`} aria-current={r.name === name ? 'page' : undefined} onClick={() => go(tripPath(trip!.id, path), true)}>
              <span class="tab-icon"><I /></span>{label}
            </button>
          ))}
        </nav>
      )}
      <UndoToast />
      <Overlays trip={trip} />
    </div>
  )
}

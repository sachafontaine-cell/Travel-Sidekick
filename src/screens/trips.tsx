import { useEffect, useState } from 'preact/hooks'
import { Crest, Icon, Sheet, Spinner } from '../ui'
import { save, settings } from '../lib/data'
import { connected, findTrips, type FoundTrip } from '../lib/sync'
import { findCity } from '../lib/weather'
import { bookingPlace } from './start'
import { between } from '../lib/rank'
import { saveTrip } from '../lib/actions'
import { trips, nowIn } from '../lib/data'
import { DEMO } from '../lib/store'
import { go, open, tripPath } from '../lib/nav'
import { newTrip } from '../lib/actions'
import { tripDays } from '../lib/planner'
import { dateRange, daysBetween } from '../lib/time'
import type { Trip } from '../lib/model'

function where(t: Trip) {
  if (!t.start || !t.end) return 'upcoming'
  const n = nowIn(t)
  return n.day < 1 ? 'upcoming' : n.day > tripDays(t) ? 'past' : 'now'
}

export function Trips() {
  const all = Object.values(trips.use()).sort((a, b) => (a.start || '9') < (b.start || '9') ? -1 : 1)
  const now = all.filter((t) => where(t) === 'now')
  const soon = all.filter((t) => where(t) === 'upcoming')
  const past = all.filter((t) => where(t) === 'past').reverse()
  const openTrip = (t: Trip) => go(tripPath(t.id, !t.dest.name || !t.start ? 'setup' : t.built ? 'today' : 'setup'))
  const people = (t: Trip) => `${t.people.length} traveler${t.people.length === 1 ? '' : 's'}`
  return (
    <main class="main">
      <div class="between">
        <div class="row"><Crest /><h1 class="h1">Trips</h1></div>
        <div class="row">
          <button class="iconbtn ring press" aria-label="This app: key, phone, alerts" onClick={() => open({ kind: 'sheet', name: 'app' })}><Icon.gear /></button>
          {!DEMO && <button class="btn btn-primary btn-sm press" onClick={() => { const t = newTrip(); go(tripPath(t.id, 'setup')) }}>+ New trip</button>}
        </div>
      </div>
      {connected() && <button class="btn btn-secondary press" onClick={() => open({ kind: 'sheet', name: 'found' })}><Icon.refresh />Find my trips (email and KAYAK)</button>}
      {DEMO && <div class="banner"><span class="dot" /><span class="grow small">Sample trip. Nothing here touches your own trips.</span><a class="link small" href={location.pathname}>Leave</a></div>}

      {now.length > 0 && <span class="label">Happening now</span>}
      {now.map((t) => {
        const n = nowIn(t)
        return (
          <button class="card hero press" onClick={() => openTrip(t)}>
            <div class="between"><span class="h2">{t.name || 'New trip'}</span><span class="strong">Day {n.day} of {tripDays(t)}</span></div>
            <span class="muted">{dateRange(t.start, t.end)} · {people(t)}</span>
          </button>
        )
      })}

      {soon.length > 0 && <span class="label">Upcoming</span>}
      {soon.length > 0 && (
        <div class="list">
          {soon.map((t) => (
            <button class="kv press" onClick={() => openTrip(t)}>
              <span class="stack" style={{ gap: '2px' }}>
                <span class="strong">{t.name || 'New trip'}</span>
                <span class="muted">{t.start ? `${dateRange(t.start, t.end)} · in ${daysBetween(nowIn(t).date, t.start)} days` : 'Dates not set'}{!t.built ? ' · setup not finished' : ''}</span>
              </span>
              <span class="chev"><Icon.chev /></span>
            </button>
          ))}
        </div>
      )}

      {!all.length && (
        <div class="empty">
          <p>Plan your first trip: where, when and who's coming. The app builds the list and plans the days.</p>
          <button class="btn btn-primary press" onClick={() => { const t = newTrip(); go(tripPath(t.id, 'setup')) }}>+ New trip</button>
          <a class="link" href="?demo">See a sample trip</a>
        </div>
      )}

      {past.length > 0 && <span class="label">Past</span>}
      {past.length > 0 && <div class="list">{past.map((t) => <button class="kv press" onClick={() => openTrip(t)}><span>{t.name}</span><span class="v">{dateRange(t.start, t.end)}</span></button>)}</div>}
    </main>
  )
}

/** Trips found in booking emails and the KAYAK calendar; one tap adds one, with its bookings. */
export function FoundSheet() {
  const [state, setState] = useState<{ busy: boolean; list?: FoundTrip[]; err?: string; adding?: string }>({ busy: false })
  settings.use(); trips.use()
  const run = async () => {
    setState({ busy: true })
    try { setState({ busy: false, list: await findTrips() }) } catch (e) {
      const m = e instanceof Error ? e.message : 'Could not read your email.'
      setState({ busy: false, err: /unknown request/i.test(m) ? 'The family script is updating itself to the new version. Try again in a minute.' : m })
    }
  }
  useEffect(() => { void run() }, [])
  const have = (f: FoundTrip) => Object.values(trips.get()).some((t) => t.start === f.start && t.dest.name.split(',')[0].toLowerCase() === f.destination.split(',')[0].toLowerCase())
  const add = async (f: FoundTrip) => {
    setState({ ...state, adding: f.destination })
    try {
      const cities = await findCity(f.destination.split(',')[0]).catch(() => [])
      const t = newTrip()
      const hotel = f.bookings.find((b) => b.kind === 'hotel' && b.lat != null && b.lng != null)
      const dest = cities[0] ?? { ...t.dest, name: f.destination, lat: hotel?.lat ?? 0, lng: hotel?.lng ?? 0 }
      const trip = { ...t, name: dest.name.split(',')[0], dest, start: f.start, end: f.end, base: hotel ? { name: hotel.name, lat: hotel.lat!, lng: hotel.lng! } : undefined }
      saveTrip(trip)
      let rank: string | undefined
      const ps = f.bookings.map((b) => { rank = between(rank, undefined); return bookingPlace(b, trip, 'a' + rank) }).filter((p): p is NonNullable<typeof p> => !!p)
      if (ps.length) save('place', ps)
      go(tripPath(trip.id, 'setup'), true)
    } catch (e) { setState({ ...state, adding: undefined, err: e instanceof Error ? e.message : 'Could not add it.' }) }
  }
  return (
    <Sheet title="Find my trips">
      {state.busy && <div class="row muted"><Spinner />Reading your booking emails and KAYAK calendar… up to a minute.</div>}
      {state.err && <><p class="answer err">{state.err}</p><button class="btn btn-quiet press" onClick={run}>Try again</button></>}
      {state.list && !state.list.length && <p class="muted">No upcoming trips found. Forward booking emails to your Gmail, or add your KAYAK calendar link in ⚙ This app.</p>}
      {state.list?.map((f) => (
        <div class="card card-pad stack">
          <div class="between"><b>{f.destination}</b><span class="muted small">{dateRange(f.start, f.end)}</span></div>
          <span class="muted small">{f.bookings.length ? f.bookings.slice(0, 4).map((b) => b.name).join(' · ') + (f.bookings.length > 4 ? ` · +${f.bookings.length - 4}` : '') : 'No bookings details'}</span>
          {have(f) ? <span class="chip ok" style={{ alignSelf: 'flex-start' }}>Already added</span>
            : <button class="btn btn-primary btn-sm press" disabled={!!state.adding} onClick={() => add(f)}>{state.adding === f.destination ? <Spinner /> : 'Add this trip'}</button>}
        </div>
      ))}
      <p class="muted small">Then check who's coming and tap Build my list.</p>
    </Sheet>
  )
}

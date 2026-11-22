// The Trip tab: links out (Google Translate, KAYAK), local rules, setup. Snap arrives in 1.1.
import { useState } from 'preact/hooks'
import { Icon, Spinner } from '../ui'
import { save, settings, tripPlaces } from '../lib/data'
import { connected, fetchBookings, shareKey } from '../lib/sync'
import { between } from '../lib/rank'
import { bookingPlace } from './start'
import { nowIn, trips } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { langName } from '../lib/money'
import { translateUrl } from './today'
import type { Trip } from '../lib/model'

/** Reads booking emails again (flights, hotel, tickets) and adds the new ones as fixed stops. */
function Bookings({ trip }: { trip: Trip }) {
  const [state, setState] = useState<{ busy?: boolean; msg?: string; err?: boolean }>({})
  if (!connected()) return null
  const run = async () => {
    setState({ busy: true })
    try {
      const k = settings.get().geminiKey
      if (k && !settings.get().keyShared) await shareKey(k)
      const found = await fetchBookings(trip.dest.name, trip.start, trip.end)
      const have = tripPlaces(trip.id)
      let rank = have.map((p) => p.rank).sort().at(-1)
      const added = []
      let base = trip.base
      for (const b of found) {
        if (b.kind === 'hotel' && b.lat != null && b.lng != null && !base) base = { name: b.name, lat: b.lat, lng: b.lng }
        rank = between(rank, undefined)
        const p = bookingPlace(b, trip, rank)
        if (p && !have.some((x) => x.name.toLowerCase() === p.name.toLowerCase() && x.day === p.day)) added.push(p)
      }
      if (added.length) save('place', added, `${added.length} booking${added.length > 1 ? 's' : ''} added`)
      if (base !== trip.base) save('trip', [{ ...trips.get()[trip.id], base }])
      setState({ msg: found.length ? `Found ${found.length} booking${found.length > 1 ? 's' : ''}; ${added.length} new.` : 'No bookings found for these dates.' })
    } catch (e) {
      setState({ err: true, msg: e instanceof Error ? e.message : 'Could not read your email.' })
    }
  }
  return (
    <div class="stack">
      <button class="kv press" disabled={state.busy} onClick={run}><span class="stack" style={{ gap: '1px' }}><span class="strong">Bookings from your email</span><span class="muted small">Flights, hotel, tickets for these dates</span></span>{state.busy ? <Spinner /> : <span class="v">Read again<Icon.chev /></span>}</button>
      {state.msg && <p class={state.err ? 'answer err' : 'muted small'}>{state.msg}</p>}
    </div>
  )
}

export function TripTab({ trip }: { trip: Trip }) {
  const t = trips.use()[trip.id] ?? trip
  const now = nowIn(t)
  const out = (href: string, label: string, sub: string) => (
    <a class="kv press" href={href} target="_blank" rel="noopener"><span class="stack" style={{ gap: '1px' }}><span class="strong">{label}</span><span class="muted small">{sub}</span></span><Icon.out /></a>
  )
  return (
    <main class="main">
      <div class="between"><h1 class="h1">{t.name} trip</h1><button class="link press" onClick={() => go('#/')}>All trips</button></div>
      <div class="list">
        {t.dest.lang !== 'en' && out(translateUrl(t), 'Google Translate', `Talk, signs and menus in ${langName(t.dest.lang)}`)}
        {out('https://www.kayak.com/trips', 'KAYAK Trips', 'Flights, hotels, bookings and documents')}
        {out(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.dest.name)}`, 'Google Maps', 'Directions and offline maps')}
      </div>
      <div class="list">
        <Bookings trip={t} />
        <button class="kv press" onClick={() => open({ kind: 'sheet', name: 'rules' })}><span class="strong">Local rules</span><span class="v">{t.rules?.length ? `${t.rules.length} tips` : 'Coming'}<Icon.chev /></span></button>
        <button class="kv press" onClick={() => go(tripPath(t.id, 'setup'))}><span class="strong">Trip setup</span><span class="v"><span class="trunc">Dates, people, vibe, day shape</span><Icon.chev /></span></button>
      </div>
      {now.day < 1 && <p class="muted small">Before you go: the checklist is on Today.</p>}
    </main>
  )
}

import { Crest, Icon } from '../ui'
import { EmailCheck } from './email'
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
      <div class="list"><EmailCheck label="Trips and bookings from your email" /></div>
      {DEMO && <div class="banner"><span class="dot" /><span class="grow small">Sample trip. Nothing here touches your own trips.</span><a class="link small" href={location.pathname}>Leave</a></div>}

      {now.length > 0 && <span class="label">Happening now</span>}
      {now.map((t) => {
        const n = nowIn(t)
        return (
          <button class="card hero press" onClick={() => openTrip(t)}>
            <div class="between"><span class="h2">{t.name || 'New trip'}</span><span class="strong">Day {n.day} of {tripDays(t)}</span></div>
            <span class="muted">{dateRange(t.start, t.end)} · {people(t)}</span>
            {t.found && !t.built && <span class="chip ok" style={{ alignSelf: 'flex-start' }}>Found in your email · tap to finish</span>}
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
                {t.found && !t.built && <span class="chip ok" style={{ alignSelf: 'flex-start' }}>Found in your email</span>}
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


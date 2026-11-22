// Today: what's next and when to leave, what to do with free time, and nothing else unless it
// matters right now. Before the trip it's the "before you go" list.
import { useState } from 'preact/hooks'
import { Icon } from '../ui'
import { nowIn, places, plansFor, save, settings, tripPlaces, trips } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { setDay, setDone } from '../lib/actions'
import { mustInfo, countdown } from '../lib/musts'
import { gapNow, ideas } from '../lib/whatnow'
import { kidBuffer } from '../lib/people'
import { weather } from '../lib/weather'
import { clock, daysBetween, duration, shortDate } from '../lib/time'
import { short } from '../lib/money'
import { tripDays } from '../lib/planner'
import { langName } from '../lib/money'
import type { Energy, Trip } from '../lib/model'

export const translateUrl = (t: Trip) => `https://translate.google.com/?sl=${t.dest.lang}&tl=en&op=translate`

function BeforeYouGo({ trip }: { trip: Trip }) {
  const lang = langName(trip.dest.lang)
  const items: [string, string, string?][] = []
  if (trip.dest.lang !== 'en') items.push(['lang', `Download ${lang} in Google Translate`, translateUrl(trip)])
  items.push(['maps', `Download ${trip.name} in Google Maps for offline use`, 'https://www.google.com/maps'])
  const ready = trip.ready ?? {}
  const tick = (k: string) => save('trip', [{ ...trips.get()[trip.id], ready: { ...ready, [k]: !ready[k] } }])
  return (
    <div class="stack">
      <span class="label">Before you go</span>
      <div class="list">
        {items.map(([k, text, url]) => (
          <div class="check">
            <input type="checkbox" aria-label={text} checked={!!ready[k]} onChange={() => tick(k)} />
            <span class="grow">{text}<br /><span class="muted small">So it works with no signal.{k === 'lang' ? ' Reminder by email 3 days before.' : ''}</span></span>
            {url && <a class="iconbtn ring press" href={url} target="_blank" rel="noopener" aria-label={`Open: ${text}`}><Icon.out /></a>}
          </div>
        ))}
      </div>
    </div>
  )
}

function MustLine({ trip, today, now }: { trip: Trip; today: number; now: number }) {
  const infos = mustInfo(trip, tripPlaces(trip.id), plansFor(trip), today, now)
  const c = countdown(trip, infos, today)
  if (!c.total) return null
  return (
    <button class="banner press" onClick={() => (c.atRisk ? open({ kind: 'rebalance' }) : go(tripPath(trip.id, 'plan'), true))}>
      <span class={`dot${c.atRisk ? ' red' : ''}`} />
      <span class="grow"><b>Must-sees {c.done} of {c.total}</b>{c.atRisk ? ` · ${c.atRisk} at risk` : ` · ${c.daysLeft} days left`}</span>
      <span class="strong">{c.atRisk ? 'Fix' : 'Plan'}</span><Icon.chev />
    </button>
  )
}

export function Today({ trip }: { trip: Trip }) {
  places.use(); trips.use()
  const s = settings.use()
  const wx = weather.use()[trip.id]
  const now = nowIn(trip)
  const n = tripDays(trip)
  const [pick, setPick] = useState(0)

  const header = (title: string, eyebrow: string) => (
    <div class="between" style={{ alignItems: 'flex-end' }}>
      <div><p class="eyebrow">{eyebrow}</p><h1 class="h1">{title}</h1></div>
      {wx && wx.date === now.date && <span class="strong" style={{ textAlign: 'right' }}>{wx.temp}°{wx.rainAt != null && <><br /><span class="muted small">rain at {wx.rainAt % 12 || 12} {wx.rainAt < 12 ? 'AM' : 'PM'}</span></>}</span>}
    </div>
  )

  if (now.day < 1) {
    const inDays = daysBetween(now.date, trip.start)
    return (
      <main class="main">
        {header(`${trip.name} in ${inDays} day${inDays === 1 ? '' : 's'}`, shortDate(trip.start))}
        <MustLine trip={trip} today={0} now={now.min} />
        <BeforeYouGo trip={trip} />
        <button class="btn btn-secondary press" onClick={() => go(tripPath(trip.id, 'plan/1'), true)}>Walk through Day 1</button>
      </main>
    )
  }
  if (now.day > n) {
    return (
      <main class="main">
        {header('Trip over', trip.name)}
        <p class="muted">Welcome home. The plan stays here if you want to look back.</p>
        <button class="btn btn-secondary press" onClick={() => go('#/', true)}>All trips</button>
      </main>
    )
  }

  const plan = plansFor(trip)[now.day - 1]
  const slots = plan?.slots ?? []
  const asked = slots.filter((x) => x.place && x.end <= now.min && !x.place.done && x.place.status !== 'out')
  const next = slots.find((x) => x.end > now.min)
  const energy: Energy = s.energy?.date === now.date ? s.energy.level : 'ok'
  const gap = gapNow(trip, plan, now.min)
  const list = gap.minutes >= 30 ? ideas(trip, tripPlaces(trip.id), now.date, now.min, gap, energy) : []
  const idea = list.length ? list[pick % list.length] : undefined
  const later = slots.filter((x) => x.start > now.min && x !== next).slice(0, 3)
  const leaveBy = next && next.start > now.min && next.travel.minutes > 0 ? next.start - next.travel.minutes - kidBuffer(trip) : null

  return (
    <main class="main">
      {header('Today', `${trip.name} · Day ${now.day} of ${n}`)}

      {asked.slice(-1).map((x) => (
        <div class="banner">
          <span class="grow"><b>{x.place!.name}</b>: done?</span>
          <button class="btn btn-primary btn-sm press" onClick={() => setDone(x.id, true)}>Yes</button>
          <button class="btn btn-quiet btn-sm press" onClick={() => setDay(x.id, null)}>Not yet</button>
        </div>
      ))}

      {next ? (
        <button class="card hero press" style={{ textAlign: 'left' }} onClick={() => next.place ? open({ kind: 'card', place: next.id }) : go(tripPath(trip.id, `plan/${now.day}`), true)}>
          <span class="label">{next.start <= now.min ? 'Now' : 'Next up'} · {clock(next.start)}</span>
          <span class="h2">{next.place?.name ?? (next.kind === 'downtime' ? 'Downtime' : 'Lunch')}</span>
          {leaveBy != null && (
            <span class="leave"><b>Leave by {clock(leaveBy)}</b><span class="muted small">{next.travel.minutes} min {next.travel.mode === 'metro' ? 'metro' : 'walk'} + {kidBuffer(trip)} min kid buffer</span></span>
          )}
        </button>
      ) : (
        <div class="card card-pad"><p>Nothing else planned today.</p></div>
      )}

      {list.length > 0 && idea && (
        <div class="card hero">
          <div class="between"><span class="h2">What now?</span><span class="muted small">{duration(gap.minutes)} free</span></div>
          <button class="idea press" onClick={() => open({ kind: 'card', place: idea.place.id })}>
            <span class="between"><b>{idea.place.name}</b><b>{idea.place.worth}/10</b></span>
            <span class="muted small">{idea.travel.minutes} min {idea.travel.mode === 'metro' ? 'metro' : 'walk'} · {short(trip, idea.place.price)} · {idea.minutes} min · {idea.place.why}</span>
          </button>
          {list.length > 1 && <button class="btn btn-quiet btn-sm press" onClick={() => setPick(pick + 1)}>Another idea</button>}
          <div class="stack" style={{ gap: '4px' }}>
            <span class="muted small">How's everyone?</span>
            <div class="energy" role="group" aria-label="Energy">
              {(['tired', 'ok', 'fresh'] as Energy[]).map((e) => <button class={`pill press${energy === e ? ' on' : ''}`} aria-pressed={energy === e} onClick={() => { settings.set({ ...settings.get(), energy: { date: now.date, level: e } }); setPick(0) }}>{e === 'tired' ? 'Tired' : e === 'ok' ? 'OK' : 'Fresh'}</button>)}
            </div>
          </div>
        </div>
      )}

      <MustLine trip={trip} today={now.day} now={now.min} />

      {later.length > 0 && (
        <div class="stack">
          <span class="label">Later today</span>
          <div class="list">
            {later.map((x) => (
              <button class="kv press" onClick={() => (x.place ? open({ kind: 'card', place: x.id }) : go(tripPath(trip.id, `plan/${now.day}`), true))}>
                <span class="row"><span class="strong num" style={{ width: '64px' }}>{clock(x.start, true)}</span><span>{x.place?.name ?? (x.kind === 'downtime' ? 'Downtime' : 'Lunch')}</span></span>
                <Icon.chev />
              </button>
            ))}
          </div>
          <button class="link press" style={{ alignSelf: 'center' }} onClick={() => go(tripPath(trip.id, `plan/${now.day}`), true)}>See the whole day</button>
        </div>
      )}
    </main>
  )
}

// Today: what's next and when to leave, what to do with free time, and nothing else unless it
// matters right now. Before the trip it's the "before you go" list.
import { useState } from 'preact/hooks'
import { Icon } from '../ui'
import { nowIn, places, plansFor, save, save as save_, settings, tripPlaces, trips } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { addNow, setDay, setDone } from '../lib/actions'
import { mustInfo, countdown } from '../lib/musts'
import { gapNow, ideas } from '../lib/whatnow'
import { kidBuffer } from '../lib/people'
import { weather } from '../lib/weather'
import { clock, daysBetween, duration, shortDate } from '../lib/time'
import { short } from '../lib/money'
import { tripDays } from '../lib/planner'
import { langName } from '../lib/money'
import type { Energy, Trip } from '../lib/model'
import { Photos } from './card'
import { legText, legTextOf } from '../lib/geo'
import { realLegs } from '../lib/legs'
import { TripBar } from './tripbar'

export const translateUrl = (t: Trip) => `https://translate.google.com/?sl=${t.dest.lang}&tl=en&op=translate`

function BeforeYouGo({ trip }: { trip: Trip }) {
  const lang = langName(trip.dest.lang)
  const items: [string, string, string?][] = []
  if (trip.dest.lang !== 'en') items.push(['lang', `Download ${lang} in Google Translate`, translateUrl(trip)])
  items.push(['maps', `Download ${trip.name} in Google Maps`, 'https://www.google.com/maps'])
  const ready = trip.ready ?? {}
  const tick = (k: string) => save('trip', [{ ...trips.get()[trip.id], ready: { ...ready, [k]: !ready[k] } }])
  return (
    <div class="stack">
      <span class="label">Before you go</span>
      <div class="list">
        {items.map(([k, text, url]) => (
          <div class="check">
            <input type="checkbox" aria-label={text} checked={!!ready[k]} onChange={() => tick(k)} />
            <span class="grow">{text}<br /><span class="muted small">Works with no signal.{k === 'lang' ? ' Email reminder 3 days before.' : ''}</span></span>
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

/** Weather for a date, small: "24°C · rain at 16:00". */
export function Weather({ trip, date }: { trip: Trip; date: string }) {
  const wx = weather.use()[trip.id]
  if (!wx || !wx.c || wx.date !== date) return null
  return <span class="muted small">{wx.temp}°C{wx.rainAt != null ? ` · rain at ${wx.rainAt}:00` : ''}</span>
}

/** Before the trip, at the top of Days: the countdown and what to download. */
export function BeforeTrip({ trip }: { trip: Trip }) {
  const now = nowIn(trip)
  const inDays = daysBetween(now.date, trip.start)
  return (
    <div class="stack">
      <p class="h3">{trip.name} in {inDays} day{inDays === 1 ? '' : 's'}</p>
      <BeforeYouGo trip={trip} />
    </div>
  )
}

/**
 * Right now, at the top of today in Days: "done?" for what just ended, what's next and when to
 * leave (with directions), and an idea when there's free time.
 */
export function Now({ trip }: { trip: Trip }) {
  places.use(); trips.use(); realLegs.use()
  const s = settings.use()
  const now = nowIn(trip)
  const [pick, setPick] = useState(0)
  const plan = plansFor(trip)[now.day - 1]
  if (!plan) return null
  const slots = plan.slots
  const next = slots.find((x) => x.end > now.min)
  const energy: Energy = s.energy?.date === now.date ? s.energy.level : 'ok'
  const gap = gapNow(trip, plan, now.min)
  const list = gap.minutes >= 30 ? ideas(trip, tripPlaces(trip.id), now.date, now.min, gap, energy) : []
  const idea = list.length ? list[pick % list.length] : undefined
  const leaveBy = next && next.start > now.min && next.travel.minutes > 0 ? next.start - next.travel.minutes - kidBuffer(trip) : null
  const dir = next?.place ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${next.place.name}, ${trip.dest.name}`)}&travelmode=${next.travel.mode === 'car' ? 'driving' : next.travel.mode === 'transit' ? 'transit' : 'walking'}` : null

  return (
    <>
      {next && (
        <div class="card hero nowcard">
          <button class="stack press" style={{ gap: '4px', textAlign: 'left' }} onClick={() => next.place && open({ kind: 'card', place: next.id })}>
            <span class="label">{next.start <= now.min ? 'Now' : 'Next up'} · {clock(next.start)}</span>
            <span class="h2">{next.place?.name ?? (next.kind === 'downtime' ? 'Downtime' : 'Lunch')}</span>
          </button>
          {leaveBy != null && (
            <div class="leave">
              <span class="grow stack" style={{ gap: '2px' }}><b>Leave by {clock(leaveBy)}</b><span class="muted small">{legTextOf(next.travel)} + {kidBuffer(trip)} min kid buffer</span></span>
              {dir && <a class="btn btn-primary btn-sm press" href={dir} target="_blank" rel="noopener"><Icon.pin />Go</a>}
            </div>
          )}
        </div>
      )}

      {list.length > 0 && idea && (
        <div class="card hero">
          <div class="between"><span class="h3">Free time? {duration(gap.minutes)}</span>
            <div class="energy mini" role="group" aria-label="Energy">
              {(['tired', 'ok', 'fresh'] as Energy[]).map((e) => <button class={`press${energy === e ? ' on' : ''}`} aria-pressed={energy === e} aria-label={e === 'tired' ? 'Tired' : e === 'ok' ? 'OK' : 'Fresh'} onClick={() => { settings.set({ ...settings.get(), energy: { date: now.date, level: e } }); setPick(0) }}>{e === 'tired' ? '😴' : e === 'ok' ? '🙂' : '⚡'}</button>)}
            </div>
          </div>
          <button class="idea press row" style={{ alignItems: 'flex-start' }} onClick={() => open({ kind: 'card', place: idea.place.id })}>
            <Photos p={idea.place} size="thumb" />
            <span class="grow stack" style={{ gap: '4px' }}>
              <span class="between"><b>{idea.place.name}</b><b>{idea.place.worth}/10</b></span>
              <span class="muted small">{legText(idea.travel)} · {short(trip, idea.place.price)} · {idea.minutes} min · {idea.place.why}</span>
            </span>
          </button>
          <div class="row">
            <button class="btn btn-primary btn-sm grow press" onClick={() => { addNow(trip, idea.place.id, now.day, now.min, slots); setPick(0) }}>Go now</button>
            {list.length > 1 && <button class="btn btn-quiet btn-sm grow press" onClick={() => setPick(pick + 1)}>Another idea</button>}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * "Did you do these?": every stop that's behind you (earlier days, and today's that have ended)
 * and isn't marked done yet. All ticked to start; Save marks them done, and unticked ones go back
 * to Ideas. Done places are never suggested again and count for must-sees.
 */
export function DidYouDo({ trip }: { trip: Trip }) {
  const ps = places.use()
  const now = nowIn(trip)
  const plans = plansFor(trip)
  const past = plans.filter((pl) => pl.day <= now.day).flatMap((pl) => pl.slots.filter((x) => x.place && (pl.day < now.day || x.end <= now.min)).map((x) => ({ p: ps[x.id], day: pl.day })))
    // Flights and other bookings that aren't activities just happen: nothing to ask.
    .filter(({ p }) => p && !p.done && p.status !== 'out' && !(p.booked && p.kind === 'other'))
  const [off, setOff] = useState<string[]>([])
  if (!past.length) return null
  const save = () => {
    const changed = past.map(({ p }) => (off.includes(p.id) ? { ...p, day: null, dayRank: undefined, fixed: p.booked ? p.fixed : null } : { ...p, done: true }))
    const n = past.length - off.length
    save_('place', changed, `${n} marked done${off.length ? ` · ${off.length} back in Ideas` : ''}`)
    setOff([])
  }
  return (
    <div class="card card-pad stack didyou">
      <div class="between"><b>Did you do these?</b><span class="muted small">Untick what you missed</span></div>
      <div class="list">
        {past.map(({ p, day }) => {
          const on = !off.includes(p.id)
          return (
            <button class="check press" role="checkbox" aria-checked={on} aria-label={p.name} onClick={() => setOff(on ? [...off, p.id] : off.filter((x) => x !== p.id))}>
              <span class={`tick${on ? ' on' : ''}`} style={{ width: '32px', height: '32px' }}><span>{on ? <Icon.check /> : null}</span></span>
              <span class="grow" style={{ textAlign: 'left' }}>{p.name}</span>
              <span class="muted small">{day === now.day ? 'Today' : `Day ${day}`}</span>
            </button>
          )
        })}
      </div>
      <button class="btn btn-primary press" onClick={save}>Save</button>
    </div>
  )
}

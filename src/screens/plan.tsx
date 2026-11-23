// Days: the trip as a calendar. Tap a date to see that day's timeline; one alert at most
// (a must-see at risk, or wanted places not on a day yet). Choosing what to do is in Ideas.
import { useEffect, useRef } from 'preact/hooks'
import { Icon } from '../ui'
import { days, nowIn, places, plansFor, tripPlaces, trips } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { moveInDay, setDay } from '../lib/actions'
import { startDrag, swipeable } from '../lib/gestures'
import { countdown, mustInfo } from '../lib/musts'
import { dateOf, dayPlaces, tripDays, type Slot } from '../lib/planner'
import { clock, WEEKDAY, WEEKDAY_LONG, weekday } from '../lib/time'
import { legText } from '../lib/geo'
import { fitWanted, pendingFor, unfitIds } from './ideas'
import { TripBar } from './tripbar'
import type { Trip } from '../lib/model'

export function Plan({ trip, day }: { trip: Trip; day: number }) {
  places.use(); days.use(); trips.use(); unfitIds.use()
  const n = tripDays(trip)
  const now = nowIn(trip)
  // Opens on today during the trip, else Day 1.
  const sel = day >= 1 ? Math.min(day, n) : now.day >= 1 && now.day <= n ? now.day : 1
  return (
    <main class="main">
      <TripBar />
      <h1 class="h1">Days</h1>
      <DateStrip trip={trip} sel={sel} />
      <Alert trip={trip} />
      <Day trip={trip} day={sel} />
    </main>
  )
}

/** The trip's dates in one row, like Calendar: weekday, date, a dot when something's planned. */
function DateStrip({ trip, sel }: { trip: Trip; sel: number }) {
  const n = tripDays(trip)
  const now = nowIn(trip)
  const ref = useRef<HTMLDivElement>(null)
  const list = tripPlaces(trip.id)
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [sel])
  return (
    <div class={`datestrip${n <= 7 ? ' fit' : ''}`} role="tablist" aria-label="Days" ref={ref} style={n <= 7 ? { gridTemplateColumns: `repeat(${n}, 1fr)` } : undefined}>
      {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
        const date = dateOf(trip, d)
        const stops = dayPlaces(list, d).length
        return (
          <button role="tab" aria-selected={d === sel} aria-label={`Day ${d}, ${WEEKDAY_LONG[weekday(date)]} ${Number(date.slice(8))}${d === now.day ? ', today' : ''}`}
            class={`date press${d === sel ? ' on' : ''}${d === now.day ? ' today' : ''}${d < now.day ? ' past' : ''}`} onClick={() => go(tripPath(trip.id, `plan/${d}`), true)}>
            <span class="wd">{d === now.day ? 'Today' : WEEKDAY[weekday(date)]}</span>
            <b class="num">{Number(date.slice(8))}</b>
            <span class={`dots${stops ? ' on' : ''}`} />
          </button>
        )
      })}
    </div>
  )
}

/** One thing at most: a must-see at risk first, else wanted places that aren't on a day. */
function Alert({ trip }: { trip: Trip }) {
  const now = nowIn(trip)
  const infos = mustInfo(trip, tripPlaces(trip.id), plansFor(trip), now.day, now.min)
  const c = countdown(trip, infos, now.day)
  if (c.atRisk) return (
    <button class="banner press" onClick={() => open({ kind: 'rebalance' })}>
      <span class="dot red" /><span class="grow"><b>{c.atRisk} must-see{c.atRisk > 1 ? 's' : ''} at risk</b> · {c.done} of {c.total} done</span><span class="strong">Fix</span><Icon.chev />
    </button>
  )
  const pend = pendingFor(trip)
  if (pend && (pend.add.length || pend.remove.length)) return (
    <div class="banner">
      <span class="dot" /><span class="grow small">{pend.add.length ? `${pend.add.length} wanted place${pend.add.length > 1 ? 's aren\'t' : ' isn\'t'} on a day yet` : `${pend.remove.length} place${pend.remove.length > 1 ? 's' : ''} you don't want any more`}</span>
      <button class="btn btn-primary btn-sm press" onClick={() => fitWanted(trip)}>{pend.add.length ? 'Fit in' : 'Take off'}</button>
    </div>
  )
  return null
}


const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ---- One day

function Day({ trip, day }: { trip: Trip; day: number }) {
  const plan = plansFor(trip)[day - 1]
  const now = nowIn(trip)
  const ref = useRef<HTMLDivElement>(null)
  const date = dateOf(trip, day)
  if (!plan) return null
  const slots = plan.slots
  const near = plan.walkMi >= plan.limitMi * 0.8
  const fixFrom = Math.max(day, now.day + 1)
  const dropAt = (from: number, to: number) => {
    const s = slots[from]
    const rest = slots.filter((_, k) => k !== from)
    if (s.kind === 'downtime') return moveInDay(trip, day, 'downtime', rest[to - 1]?.id)
    const before = rest.slice(0, to).reverse().find((x) => x.kind === 'place')
    const after = rest.slice(to).find((x) => x.kind === 'place')
    moveInDay(trip, day, s.id, before?.id, after?.id)
  }
  return (
    <>
      <div class="between"><span class="h3">{WEEKDAY_LONG[weekday(date)]} {Number(date.slice(8))} {MONTHS[Number(date.slice(5, 7)) - 1]}</span><span class="muted small">Day {day} · walking {plan.walkMi} of {plan.limitMi} mi</span></div>
      {near && <div class="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (plan.walkMi / plan.limitMi) * 100)}%`, background: plan.over ? 'var(--danger)' : undefined }} /></div>}
      {plan.issues.length > 0 && day >= fixFrom - 1 && (
        <div class="banner">
          <span class="dot red" />
          <span class="grow small">{plan.issues[0]}</span>
          <button class="btn btn-quiet btn-sm press" onClick={() => open({ kind: 'rebalance' })}>Review</button>
        </div>
      )}
      {slots.length === 0 ? (
        <div class="empty"><p>Nothing planned yet.</p><button class="btn btn-secondary press" onClick={() => go(tripPath(trip.id, 'ideas'), true)}>Choose from your ideas</button></div>
      ) : (
        <div class="list" ref={ref}>
          {slots.map((s, i) => <SlotRow trip={trip} s={s} first={i === 0} past={day < now.day || (day === now.day && s.end <= now.min)} onGrip={(e) => ref.current && startDrag(e, ref.current, i, dropAt)} />)}
        </div>
      )}
      {day >= now.day && <button class="btn btn-secondary press" onClick={() => open({ kind: 'sheet', name: 'addday', arg: String(day) })}><Icon.plus />Add to this day</button>}
      {slots.some((s) => s.place) && <p class="muted small tcenter">Swipe ← to take a stop off this day.</p>}
    </>
  )
}

function SlotRow({ trip, s, first, past, onGrip }: { trip: Trip; s: Slot; first: boolean; past: boolean; onGrip: (e: PointerEvent) => void }) {
  const sw = swipeable(s.place ? () => setDay(s.id, null) : undefined)
  const travel = !first && s.travel.minutes > 0 ? legText(s.travel) : ''
  const name = s.place?.name ?? (s.kind === 'downtime' ? `Downtime · ${s.end - s.start} min` : 'Lunch (pick a spot nearby)')
  const sub = s.warn ?? (s.place?.booked ?? (s.kind === 'downtime' ? (trip.base ? `At ${trip.base.name}` : 'Rest nearby') : s.place ? `Worth ${s.place.worth}${s.wait && s.wait >= 15 ? ` · ${s.wait} min free before` : ''}` : ''))
  return (
    <div class={`slot${s.kind !== 'place' ? ' rest' : ''}${s.place?.done ? ' done' : ''}`} data-drag data-left="Off this day" {...sw} style={past ? { opacity: 0.6 } : undefined}>
      <span class="t num">{clock(s.start, true)}</span>
      <button class="open press" disabled={!s.place} onClick={() => s.place && open({ kind: 'card', place: s.id })}>
        <span class="name strong">{name}</span>
        <span class={`small ${s.warn ? 'warn' : 'muted'}`}>{travel ? `${travel} · ` : ''}{sub}</span>
      </button>
      {s.kind !== 'lunch' && <span class="handle" role="button" aria-label={`Drag to move ${name}`} onPointerDown={(e) => onGrip(e as unknown as PointerEvent)}><Icon.grip /></span>}
    </div>
  )
}

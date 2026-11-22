// Plan: "All" is the checklist (must-sees summary, every activity, Skipped); check what you want
// and "Plan my days" fits it into the days. Each day chip shows that day's timeline.
import { useMemo, useRef, useState } from 'preact/hooks'
import { createStore } from '../lib/store'
import { BadgeChip, Icon, StateChip } from '../ui'
import { days, nowIn, places, plansFor, save, tripPlaces, trips } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { moveInDay, moveInList, pushDown, setDay, setStatus } from '../lib/actions'
import { startDrag, swipeable } from '../lib/gestures'
import { countdown, mustInfo } from '../lib/musts'
import { planChecked, planPending, rebalance } from '../lib/rebalance'
import { dateOf, tripDays, type Slot } from '../lib/planner'
import { clock, shortDate, WEEKDAY, weekday } from '../lib/time'
import { price } from '../lib/money'
import { km } from '../lib/geo'
import { byRank } from '../lib/rank'
import { filters, type Filters } from './sheets'
import { TripBar } from './tripbar'
import type { Place, Status, Trip } from '../lib/model'

export function Plan({ trip, day }: { trip: Trip; day: number }) {
  places.use(); days.use(); trips.use()
  const n = tripDays(trip)
  const now = nowIn(trip)
  return (
    <main class="main">
      <TripBar />
      <h1 class="h1">Plan</h1>
      <div class="strip" role="tablist" aria-label="Days">
        <button role="tab" aria-selected={day === 0} class={`pill press${day === 0 ? ' on' : ''}`} onClick={() => go(tripPath(trip.id, 'plan'), true)}>All</button>
        {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
          const date = dateOf(trip, d)
          return <button role="tab" aria-selected={day === d} class={`pill press${day === d ? ' on' : ''}`} onClick={() => go(tripPath(trip.id, `plan/${d}`), true)}>{d === now.day ? 'Today' : `D${d}`} <span style={{ fontWeight: 500, opacity: 0.8 }}>{WEEKDAY[weekday(date)]}</span></button>
        })}
      </div>
      {day === 0 ? <All trip={trip} /> : <Day trip={trip} day={Math.min(day, n)} />}
    </main>
  )
}

function useRebalance(trip: Trip) {
  const now = nowIn(trip)
  const all = tripPlaces(trip.id)
  return useMemo(() => rebalance(trip, all, days.get(), now.day, now.min), [trip, places.get(), days.get()])
}

// ---- All

function sortList(list: Place[], f: Filters, trip: Trip): Place[] {
  const base = trip.base ?? trip.dest
  const s = [...list]
  if (f.sort === 'worth') s.sort((a, b) => b.worth - a.worth)
  else if (f.sort === 'value') s.sort((a, b) => b.value - a.value)
  else if (f.sort === 'price') s.sort((a, b) => a.price - b.price)
  else if (f.sort === 'distance') s.sort((a, b) => km(base, a) - km(base, b))
  else if (f.sort === 'must') s.sort((a, b) => Number(b.must) - Number(a.must) || byRank(a, b))
  else s.sort(byRank)
  return s.filter((p) => (!f.hideTraps || p.badge !== 'trap') && (!f.under || p.price <= f.under) && (!f.kids || p.sub.kid >= 7) && (!f.near || km(base, p) < 1.5))
}

function All({ trip }: { trip: Trip }) {
  const f = filters.use()
  const all = tripPlaces(trip.id)
  const now = nowIn(trip)
  const infos = mustInfo(trip, all, plansFor(trip), now.day, now.min)
  const c = countdown(trip, infos, now.day)
  const risky = infos.filter((i) => i.state !== 'done' && i.state !== 'scheduled')
  const [showOut, setShowOut] = useState(false)
  const list = sortList(all.filter((p) => p.status !== 'out'), f, trip)
  const out = sortList(all.filter((p) => p.status === 'out'), { ...f, hideTraps: false }, trip)
  const custom = f.sort !== 'mine' || f.hideTraps === false || f.under || f.kids || f.near
  const checked = all.filter((p) => p.must && p.hours?.source === 'google' && p.hours.checkedAt).map((p) => p.hours!.checkedAt!).sort().at(-1)
  const ticked = list.filter((p) => p.status === 'picked').length

  return (
    <>
      {c.total > 0 && (
        <div class="card hero">
          <div class="between"><span class="h2">Must-sees {c.done} of {c.total}</span><span class="muted">{c.daysLeft} day{c.daysLeft === 1 ? '' : 's'} left</span></div>
          <div class="bar" role="progressbar" aria-valuenow={c.done} aria-valuemax={c.total} aria-label="Must-sees done"><span style={{ width: `${(c.done / c.total) * 100}%` }} /></div>
          {checked && <span class="muted small">Hours checked with Google · {new Date(checked).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
          {risky.map((i) => (
            <button class="between press" style={{ minHeight: '48px', textAlign: 'left' }} onClick={() => open({ kind: 'card', place: i.place.id })}>
              <span class="grow"><b>{i.place.name}</b><br /><span class="muted small">{i.line}</span></span><StateChip s={i.state} />
            </button>
          ))}
          {risky.length > 0 && <button class="btn btn-primary press" onClick={() => open({ kind: 'rebalance' })}>Fix it: save {risky.length === 1 ? 'it' : `all ${risky.length}`}</button>}
        </div>
      )}

      <div class="row">
        <button class={`pill press${custom ? ' dark' : ''}`} onClick={() => open({ kind: 'sheet', name: 'filter' })}><Icon.filter />{custom ? 'Filtered' : 'Sort & filter'}</button>
        <span class="grow" />
        <button class="pill press" onClick={() => open({ kind: 'sheet', name: 'add', arg: trip.id })}><Icon.plus />Add</button>
      </div>

      <Section trip={trip} title={`Activities · ${ticked} checked`} list={list} status="picked" draggable={f.sort === 'mine'} />
      {out.length > 0 && <button class="fold press" aria-expanded={showOut} onClick={() => setShowOut(!showOut)}>Skipped ({out.length}){showOut ? <Icon.up /> : <Icon.down />}</button>}
      {showOut && <Section trip={trip} list={out} status="out" draggable={false} />}
      <PlanBar trip={trip} />
    </>
  )
}

/** Places that didn't fit the last time "Plan my days" ran (so the bar doesn't nag about them). */
const unfitIds = createStore<string[]>([])

/** Sticky at the bottom whenever the checks and the days disagree. */
function PlanBar({ trip }: { trip: Trip }) {
  const unfit = unfitIds.use()
  const now = nowIn(trip)
  const fromDay = now.day >= 1 ? now.day + 1 : 1
  if (fromDay > tripDays(trip)) return null
  const all = tripPlaces(trip.id)
  const { add, remove } = planPending(all, fromDay)
  const fresh = add.filter((p) => !unfit.includes(p.id))
  if (!fresh.length && !remove.length) {
    return add.length ? <p class="muted small center">{add.length} checked {add.length === 1 ? "doesn't" : "don't"} fit the days: {add.map((p) => p.name).join(', ')}.</p> : null
  }
  const run = () => {
    const r = planChecked(trip, all, days.get(), fromDay)
    unfitIds.set(r.unfit.map((p) => p.id))
    const parts = [r.added && `${r.added} added`, r.removed && `${r.removed} removed`, r.unfit.length && `${r.unfit.length} didn't fit`].filter(Boolean)
    save('place', r.places, `Days planned${parts.length ? ` · ${parts.join(' · ')}` : ''}`)
  }
  const what = [fresh.length && `${fresh.length} to add`, remove.length && `${remove.length} to remove`].filter(Boolean).join(' · ')
  return (
    <div class="planbar">
      <button class="btn btn-primary grow press" onClick={run}><Icon.plan />Plan my days</button>
      <span class="small">{what}{now.day >= 1 ? ' · from tomorrow' : ''}</span>
    </div>
  )
}

function Section({ trip, title, list, status, draggable }: { trip: Trip; title?: string; list: Place[]; status: Status; draggable: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  if (!list.length && status === 'out') return null
  return (
    <div class="section">
      {title && <div class="section-h"><span class="label">{title}</span>{list.length > 0 && <span class="muted small">Check what you want</span>}</div>}
      {list.length === 0 ? <p class="muted small">Nothing here. Tap + Add.</p> : (
        <div class="list" ref={ref}>
          {list.map((p, i) => <Row trip={trip} p={p} draggable={draggable} onGrip={(e) => ref.current && startDrag(e, ref.current, i, (from, to) => {
            const rest = list.filter((_, k) => k !== from)
            moveInList(list[from].id, rest[to - 1], rest[to])
          })} />)}
        </div>
      )}
    </div>
  )
}

/** The checkbox: checked = want it. ↺ on a skipped place brings it back. Swipe ← skips, → checks. */
export function Tick({ p }: { p: Place }) {
  const on = p.status === 'picked'
  const act = () => setStatus(p.id, on ? 'maybe' : p.status === 'out' ? 'maybe' : 'picked')
  if (p.status === 'out') return <button class="tick out press" aria-label={`Bring back ${p.name}`} onClick={act}><span><Icon.refresh /></span></button>
  return <button class={`tick press${on ? ' on' : ''}`} role="checkbox" aria-checked={on} aria-label={p.name} onClick={act}><span>{on ? <Icon.check /> : null}</span></button>
}

function Row({ trip, p, draggable, onGrip }: { trip: Trip; p: Place; draggable: boolean; onGrip: (e: PointerEvent) => void }) {
  const left = p.status === 'out' ? undefined : () => (p.must ? pushDown(p.id) : setStatus(p.id, 'out'))
  const right = p.status === 'picked' ? undefined : () => setStatus(p.id, p.status === 'out' ? 'maybe' : 'picked')
  const sw = swipeable(left, right)
  return (
    <div class={`prow${p.done ? ' done' : ''}`} data-drag data-left={p.must ? 'To the bottom' : 'Skip'} data-right={p.status === 'out' ? 'Bring back' : 'Check'} {...sw}>
      <Tick p={p} />
      <button class="open press" onClick={() => open({ kind: 'card', place: p.id })}>
        <span class="name">{p.name}</span>
        <span class="meta"><BadgeChip p={p} />{p.scoring ? <span>Scoring…</span> : <span>Worth {p.worth} · {price(trip, p.price, false)}</span>}{p.day ? <span class="chip plain">Day {p.day}</span> : p.status === 'picked' && unfitIds.get().includes(p.id) ? <span class="chip amber">Doesn't fit</span> : null}{p.done && <span class="chip plain">Done</span>}</span>
      </button>
      {draggable && <span class="handle" role="button" aria-label={`Drag to reorder ${p.name}`} onPointerDown={(e) => onGrip(e as unknown as PointerEvent)}><Icon.grip /></span>}
    </div>
  )
}

// ---- One day

function Day({ trip, day }: { trip: Trip; day: number }) {
  const plan = plansFor(trip)[day - 1]
  const now = nowIn(trip)
  const ref = useRef<HTMLDivElement>(null)
  const prop = useRebalance(trip)
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
      <div class="between"><span class="strong">{WEEKDAY[weekday(date)]} {shortDate(date)}{day === now.day ? ' · today' : ''}</span><span class="muted small">Walking {plan.walkMi} of {plan.limitMi} mi</span></div>
      {near && <div class="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (plan.walkMi / plan.limitMi) * 100)}%`, background: plan.over ? 'var(--danger)' : undefined }} /></div>}
      {(plan.issues.length > 0 || prop.changes.length > 0) && day >= fixFrom - 1 && (
        <div class="banner">
          <span class="dot red" />
          <span class="grow small">{plan.issues[0] ?? `${prop.changes.length} change${prop.changes.length > 1 ? 's' : ''} would keep the days balanced`}</span>
          <button class="btn btn-quiet btn-sm press" onClick={() => open({ kind: 'rebalance' })}>Review</button>
        </div>
      )}
      {slots.length === 0 ? (
        <div class="empty"><p>Nothing planned yet.</p></div>
      ) : (
        <div class="list" ref={ref}>
          {slots.map((s, i) => <SlotRow trip={trip} s={s} first={i === 0} past={day < now.day || (day === now.day && s.end <= now.min)} onGrip={(e) => ref.current && startDrag(e, ref.current, i, dropAt)} />)}
        </div>
      )}
      {day >= now.day && <button class="btn btn-secondary press" onClick={() => open({ kind: 'sheet', name: 'addday', arg: String(day) })}><Icon.plus />Add to this day</button>}
      {slots.some((s) => s.place) && <p class="muted small center">Swipe ← to take a stop off this day.</p>}
    </>
  )
}

function SlotRow({ trip, s, first, past, onGrip }: { trip: Trip; s: Slot; first: boolean; past: boolean; onGrip: (e: PointerEvent) => void }) {
  const sw = swipeable(s.place ? () => setDay(s.id, null) : undefined)
  const travel = !first && s.travel.minutes > 0 ? `${s.travel.minutes} min ${s.travel.mode === 'metro' ? 'metro' : 'walk'}` : ''
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
void trips

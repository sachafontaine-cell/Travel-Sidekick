// Trip Setup: six short rows, each opening its own small sheet. The only trip settings screen.
// Suggestions always appear in parentheses; anything changed by hand is tagged "Custom".
import { useEffect, useState } from 'preact/hooks'
import { Icon, Seg, Sheet, Spinner, Stepper } from '../ui'
import { trips } from '../lib/data'
import { close, go, open, tripPath } from '../lib/nav'
import { deleteTrip, saveTrip } from '../lib/actions'
import { VIBES, type Level, type Pace, type Person, type Trip, type Vibe } from '../lib/model'
import { defaultFamily, groupLimit, milesFor, PACE_DEFAULTS, suggestedMiles } from '../lib/people'
import { describe, minus, plus } from '../lib/vibes'
import { clock, dateRange, duration } from '../lib/time'
import { findAddress, findCity } from '../lib/weather'
import { tripDays } from '../lib/planner'
import { uid } from '../lib/store'

const VIBE_NAMES = Object.fromEntries(VIBES.map((v) => [v.id, v.name]))
const LEVEL = ['$', '$$', '$$$']
const PACE: [Pace, string][] = [['slow', 'Slow'], ['balanced', 'Balanced'], ['packed', 'Packed']]

const set = (t: Trip, patch: Partial<Trip>) => saveTrip({ ...trips.get()[t.id], ...patch })
const live = (id: string) => trips.use()[id]

export function suggestedVibes(t: Trip): Partial<Record<Vibe, number>> {
  return t.people.some((p) => p.age < 13) ? { cultural: 60, family: 40 } : { cultural: 60, food: 40 }
}

export function Setup({ trip }: { trip: Trip }) {
  const t = trip
  const ready = !!t.dest.name && !!t.start && !!t.end && t.people.length > 0
  const row = (name: string, label: string, value: string, missing = false) => (
    <button class="kv press" onClick={() => open({ kind: 'sheet', name, arg: t.id })}>
      <span class="strong">{label}</span>
      <span class="v" style={missing ? { color: 'var(--gold-text)', fontWeight: 600 } : undefined}><span class="trunc">{value}</span><Icon.chev /></span>
    </button>
  )
  const limit = groupLimit(t)
  return (
    <main class="main" style={{ paddingBottom: '32px' }}>
      <div class="row">
        <button class="iconbtn ring press" aria-label="Back" onClick={() => (t.built ? go(tripPath(t.id, 'trip'), true) : go('#/'))}><Icon.back /></button>
        <div class="grow"><h1 class="h1">{t.name ? `${t.name} setup` : 'New trip'}</h1><p class="muted">One place for all trip settings.</p></div>
      </div>
      <div class="list">
        {row('where', 'Where & when', t.dest.name ? `${t.name} · ${t.start ? dateRange(t.start, t.end) : 'dates?'}` : 'Not set', !t.dest.name || !t.start)}
        {row('who', "Who's coming", t.people.length ? `${t.people.length} · ${limit.miles} mi/day` : 'Not set', !t.people.length)}
        {row('vibe', 'Vibe', describe(t.vibes, VIBE_NAMES))}
        {row('budget', 'Budget', LEVEL[t.budget.all - 1] + (t.budget.lodging || t.budget.food || t.budget.activities ? ' · custom' : ''))}
        {row('shape', 'Day shape', `${PACE.find((p) => p[0] === t.pace)![1]} · ${clock(t.dayStart)}–${clock(t.dayEnd)}`)}
        {row('food', 'Food & hard nos', t.nos.length ? `${t.nos.length} hard no${t.nos.length > 1 ? 's' : ''}` : t.food ? 'Set' : 'Optional')}
      </div>
      <p class="muted small">Must-sees always included. Bookings come from your email.</p>
      {!t.built && <button class="btn btn-primary press" disabled={!ready} onClick={() => go(tripPath(t.id, 'start'))}>Build my list</button>}
      {!t.built && !ready && <p class="muted small" style={{ textAlign: 'center' }}>Needs where, when and who's coming.</p>}
      {t.built && <button class="btn btn-secondary press" onClick={() => go(tripPath(t.id, 'plan'), true)}>See the plan</button>}
      <button class="link press" style={{ alignSelf: 'center', color: 'var(--danger)' }} onClick={() => { if (confirm(`Delete ${t.name || 'this trip'} on both phones?`)) { deleteTrip(t.id); go('#/', true) } }}>Delete trip</button>
    </main>
  )
}

// ---- Sheets

function useSearch<T>(q: string, run: (q: string) => Promise<T[]>): { list: T[]; busy: boolean } {
  const [list, setList] = useState<T[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) { setList([]); return }
    let stop = false
    const t = setTimeout(async () => { setBusy(true); try { const r = await run(q); if (!stop) setList(r) } catch { if (!stop) setList([]) } finally { if (!stop) setBusy(false) } }, 300)
    return () => { stop = true; clearTimeout(t) }
  }, [q])
  return { list, busy }
}

export function WhereSheet({ id }: { id: string }) {
  const t = live(id)
  const [q, setQ] = useState('')
  const [hq, setHq] = useState('')
  const cities = useSearch(q, findCity)
  const hotels = useSearch(hq, (x) => findAddress(x, t.dest))
  if (!t) return null
  return (
    <Sheet title="Where & when">
      <label class="fieldrow"><span>Destination</span><input class="field" placeholder={t.dest.name || 'City, e.g. Paris'} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /></label>
      {cities.busy && <div class="row muted"><Spinner />Searching…</div>}
      {cities.list.length > 0 && <div class="list">{cities.list.map((c) => <button class="kv press" onClick={() => { set(t, { dest: c, name: c.name.split(',')[0] }); setQ('') }}><span>{c.name}</span><span class="v">{c.currency}</span></button>)}</div>}
      {t.dest.name && !q && <p class="muted">{t.dest.name} · {t.dest.tz} · prices in {t.dest.currency}</p>}
      <div class="row">
        <label class="fieldrow grow"><span>Start</span><input class="field" type="date" value={t.start} onInput={(e) => { const v = (e.target as HTMLInputElement).value; set(t, { start: v, end: !t.end || t.end < v ? v : t.end }) }} /></label>
        <label class="fieldrow grow"><span>End</span><input class="field" type="date" min={t.start} value={t.end} onInput={(e) => set(t, { end: (e.target as HTMLInputElement).value })} /></label>
      </div>
      {t.start && t.end && <p class="muted">{tripDays(t)} days</p>}
      {t.dest.name && <>
        <label class="fieldrow"><span>Hotel or home base</span><input class="field" placeholder={t.base?.name ?? 'Hotel name or address'} value={hq} onInput={(e) => setHq((e.target as HTMLInputElement).value)} /></label>
        {hotels.list.length > 0 && <div class="list">{hotels.list.map((h) => <button class="kv press" onClick={() => { set(t, { base: h }); setHq('') }}><span>{h.name}</span></button>)}</div>}
      </>}
    </Sheet>
  )
}

export function WhoSheet({ id }: { id: string }) {
  const t = live(id)
  if (!t) return null
  const update = (p: Person, patch: Partial<Person>) => set(t, { people: t.people.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) })
  const limit = groupLimit(t)
  const family = t.people.length ? [] : defaultFamily(Object.values(trips.get()).filter((x) => x.id !== t.id), t.start || new Date().toISOString().slice(0, 10))
  return (
    <Sheet title="Who's coming">
      {family.length > 0 && <button class="btn btn-primary press" onClick={() => set(t, { people: family })}>Add the family: {family.map((p) => p.name).join(', ')}</button>}
      {t.people.map((p) => {
        const [lo, hi] = suggestedMiles(p.age)
        return (
          <div class="card card-pad stack">
            <div class="row">
              <input class="field grow" aria-label="Name" placeholder="Name" value={p.name} onInput={(e) => update(p, { name: (e.target as HTMLInputElement).value })} />
              <input class="field" style={{ width: '84px' }} aria-label={`Age of ${p.name || 'this person'}`} type="number" inputMode="numeric" min={0} max={110} value={p.age} onInput={(e) => update(p, { age: Number((e.target as HTMLInputElement).value) || 0 })} />
              <button class="iconbtn press" aria-label={`Remove ${p.name || 'this person'}`} onClick={() => set(t, { people: t.people.filter((x) => x.id !== p.id) })}><Icon.x /></button>
            </div>
            <Stepper label="Miles per day" hint={`(suggested ${lo}–${hi} mi/day)`} value={milesFor(p)} show={(v) => `${v} mi`} step={1} min={1} max={20} custom={p.miles != null && p.miles !== hi} onChange={(v) => update(p, { miles: v === hi ? undefined : v })} />
          </div>
        )
      })}
      <button class="btn btn-quiet press" onClick={() => set(t, { people: [...t.people, { id: uid(), name: '', age: t.people.length < 2 ? 40 : 10 }] })}>+ Add person</button>
      {t.people.length > 0 && <p class="card card-pad">Group walking limit: <b>{limit.miles} mi</b> <span class="hint">(lowest: {limit.who || 'someone'}{t.pace !== 'balanced' ? `, ${t.pace} pace` : ''})</span>. Breaks every hour with kids.</p>}
    </Sheet>
  )
}

export function VibeSheet({ id }: { id: string }) {
  const t = live(id)
  const [shown, setShown] = useState<Vibe | null>(null)
  if (!t) return null
  const sug = suggestedVibes(t)
  const total = Object.values(t.vibes).reduce((a, n) => a + (n ?? 0), 0)
  return (
    <Sheet title="Vibe">
      <p class="muted">Pick any. +/− sets the mix (total 100%). Tap a name for what it means. <span class="hint">(suggested: {describe(sug, VIBE_NAMES)})</span></p>
      <div>
        {VIBES.map((v) => (
          <>
            <div class="stepper">
              <button class="vibe-name grow press" aria-expanded={shown === v.id} onClick={() => setShown(shown === v.id ? null : v.id)}>{v.name}</button>
              <button class="round press" aria-label={`Less ${v.name}`} disabled={!t.vibes[v.id]} onClick={() => set(t, { vibes: minus(t.vibes, v.id) })}>−</button>
              <span class={`stepper-value num${t.vibes[v.id] ? ' custom' : ''}`}>{t.vibes[v.id] ?? 0}%</span>
              <button class="round press" aria-label={`More ${v.name}`} disabled={t.vibes[v.id] === 100} onClick={() => set(t, { vibes: plus(t.vibes, v.id) })}>+</button>
            </div>
            {shown === v.id && <p class="says">{v.says}</p>}
          </>
        ))}
      </div>
      <div class="between"><span class="muted">Total {total}%</span><button class="link press" onClick={() => set(t, { vibes: sug })}>Use the suggestion</button></div>
    </Sheet>
  )
}

export function BudgetSheet({ id }: { id: string }) {
  const t = live(id)
  const [more, setMore] = useState(!!(t?.budget.lodging || t?.budget.food || t?.budget.activities))
  if (!t) return null
  const opts: [Level, string][] = [[1, '$'], [2, '$$'], [3, '$$$']]
  const b = t.budget
  return (
    <Sheet title="Budget">
      <p class="muted">Overall <span class="hint">(suggested $$ for {t.name || 'this trip'})</span></p>
      <Seg label="Overall budget" options={opts} value={b.all} onChange={(v) => set(t, { budget: { ...b, all: v } })} />
      <button class="link press" onClick={() => setMore(!more)}>{more ? 'Same for everything' : 'Adjust per category'}</button>
      {more && (['lodging', 'food', 'activities'] as const).map((k) => (
        <div class="stack"><span class="muted">{k[0].toUpperCase() + k.slice(1)}</span><Seg label={k} options={opts} value={b[k] ?? b.all} onChange={(v) => set(t, { budget: { ...b, [k]: v } })} /></div>
      ))}
    </Sheet>
  )
}

export function ShapeSheet({ id }: { id: string }) {
  const t = live(id)
  if (!t) return null
  const d = PACE_DEFAULTS[t.pace]
  return (
    <Sheet title="Day shape">
      <div class="stack"><span class="muted">Pace <span class="hint">(suggested: Balanced{t.people.some((p) => p.age < 10) ? ' with kids under 10' : ''})</span></span>
        <Seg label="Pace" options={PACE} value={t.pace} onChange={(v) => { const n = PACE_DEFAULTS[v]; set(t, { pace: v, dayStart: n.dayStart, dayEnd: n.dayEnd, downtime: { ...t.downtime, minutes: n.downtime } }) }} />
        <p class="muted small">Pace sets the defaults and walking distance.</p>
      </div>
      <div>
        <Stepper label="Day starts" hint={`(suggested ${clock(d.dayStart)})`} value={t.dayStart} show={(v) => clock(v)} step={15} min={300} max={t.dayEnd - 120} custom={t.dayStart !== d.dayStart} onChange={(v) => set(t, { dayStart: v })} />
        <Stepper label="Day ends" hint={`(suggested ${clock(d.dayEnd)})`} value={t.dayEnd} show={(v) => clock(v)} step={15} min={t.dayStart + 120} max={1439} custom={t.dayEnd !== d.dayEnd} onChange={(v) => set(t, { dayEnd: v })} />
        <div class="stepper">
          <div class="grow"><div class="stepper-label">Downtime each day</div><div class="muted small">(suggested with kids under 10)</div></div>
          <div style={{ width: '132px' }}><Seg label="Downtime" options={[['on', 'On'], ['off', 'Off']]} value={t.downtime.on ? 'on' : 'off'} onChange={(v) => set(t, { downtime: { ...t.downtime, on: v === 'on' } })} /></div>
        </div>
        {t.downtime.on && <Stepper label="Downtime length" hint={`(suggested ${duration(d.downtime)})`} value={t.downtime.minutes} show={duration} step={15} min={30} max={240} custom={t.downtime.minutes !== d.downtime} onChange={(v) => set(t, { downtime: { ...t.downtime, minutes: v } })} />}
      </div>
      <p class="muted small">Downtime fits in like an activity, after lunch when it can. Bookings keep their time.</p>
    </Sheet>
  )
}

export function FoodSheet({ id }: { id: string }) {
  const t = live(id)
  const [no, setNo] = useState('')
  if (!t) return null
  const add = () => { const v = no.trim(); if (v) { set(t, { nos: [...t.nos, v] }); setNo('') } }
  return (
    <Sheet title="Food & hard nos">
      <label class="fieldrow"><span>Food <span class="hint">(suggested: adventurous, with kid options)</span></span>
        <textarea class="field" rows={3} placeholder="Allergies, diets, street food yes/no…" value={t.food} onInput={(e) => set(t, { food: (e.target as HTMLTextAreaElement).value })} />
      </label>
      <div class="stack"><span class="muted">Hard nos: never suggested</span>
        {t.nos.length > 0 && <div class="chips">{t.nos.map((n) => <span class="x-chip">{n}<button aria-label={`Remove ${n}`} onClick={() => set(t, { nos: t.nos.filter((x) => x !== n) })}><Icon.x /></button></span>)}</div>}
        <div class="row"><input class="field grow" placeholder="e.g. Boat tours over 1 hour" value={no} onInput={(e) => setNo((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} /><button class="btn btn-primary btn-sm press" disabled={!no.trim()} onClick={add}>Add</button></div>
      </div>
    </Sheet>
  )
}

export const SETUP_SHEETS: Record<string, (p: { id: string }) => preact.JSX.Element | null> = {
  where: WhereSheet, who: WhoSheet, vibe: VibeSheet, budget: BudgetSheet, shape: ShapeSheet, food: FoodSheet,
}
void close

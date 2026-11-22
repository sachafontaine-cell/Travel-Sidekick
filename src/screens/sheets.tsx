// Small sheets: sort & filter, add a place, pick a day, a place's ⋯ menu, local rules.
import { useState } from 'preact/hooks'
import { Icon, Sheet, Spinner } from '../ui'
import { places, save, tripPlaces, trips } from '../lib/data'
import { close } from '../lib/nav'
import { createStore } from '../lib/store'
import { pushDown, setDay, setDone, setStatus } from '../lib/actions'
import { scorePlace } from '../lib/ai'
import { between, byRank } from '../lib/rank'
import { dateOf, hoursOn, planDay, tripDays } from '../lib/planner'
import { shortDate, WEEKDAY, weekday } from '../lib/time'
import { symbol } from '../lib/money'
import type { Place, Trip } from '../lib/model'

export interface Filters { sort: 'mine' | 'worth' | 'value' | 'price' | 'distance' | 'must'; hideTraps: boolean; under?: number; kids: boolean; near: boolean }
export const filters = createStore<Filters>({ sort: 'mine', hideTraps: true, kids: false, near: false }, 'filters')

export function FilterSheet({ trip }: { trip: Trip }) {
  const f = filters.use()
  const set = (p: Partial<Filters>) => filters.set({ ...f, ...p })
  const sorts: [Filters['sort'], string][] = [['mine', 'My order'], ['worth', 'Worth it'], ['value', 'Value'], ['price', 'Price'], ['distance', 'Distance'], ['must', 'Must-see first']]
  const cur = symbol(trip.dest.currency)
  return (
    <Sheet title="Sort & filter" foot={<button class="btn btn-quiet grow press" onClick={() => filters.set({ sort: 'mine', hideTraps: true, kids: false, near: false })}>Reset</button>}>
      <div class="stack"><span class="label">Sort</span><div class="chips">{sorts.map(([k, l]) => <button class={`pill press${f.sort === k ? ' on' : ''}`} aria-pressed={f.sort === k} onClick={() => set({ sort: k })}>{l}</button>)}</div>
        {f.sort !== 'mine' && <p class="muted small">Drag to reorder works in "My order".</p>}</div>
      <div class="stack"><span class="label">Show</span>
        <div class="chips">
          <button class={`pill press${f.hideTraps ? ' on' : ''}`} aria-pressed={f.hideTraps} onClick={() => set({ hideTraps: !f.hideTraps })}>Hide traps</button>
          {[20, 30, 50].map((n) => <button class={`pill press${f.under === n ? ' on' : ''}`} aria-pressed={f.under === n} onClick={() => set({ under: f.under === n ? undefined : n })}>Under {cur}{n}</button>)}
          <button class={`pill press${f.near ? ' on' : ''}`} aria-pressed={f.near} onClick={() => set({ near: !f.near })}>Near the hotel</button>
          <button class={`pill press${f.kids ? ' on' : ''}`} aria-pressed={f.kids} onClick={() => set({ kids: !f.kids })}>Kid-friendly</button>
        </div>
      </div>
    </Sheet>
  )
}

export function AddSheet({ trip }: { trip: Trip }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const n = name.trim()
    if (!n) return
    setBusy(true); setErr('')
    // Shown at once as "Scoring…"; Gemini fills it in a couple of seconds.
    const last = tripPlaces(trip.id).sort(byRank).at(-1)
    const rank = between(last?.rank, undefined)
    const temp: Place = { id: crypto.randomUUID(), trip: trip.id, name: n, kind: 'sight', lat: trip.base?.lat ?? trip.dest.lat, lng: trip.base?.lng ?? trip.dest.lng, badge: 'worth', must: false, worth: 0, value: 0, sub: { iconic: 0, vibe: 0, hassle: 0, kid: 0 }, rec: 'pay', recText: '', why: '', tip: '', price: 0, minutes: 60, suggested: 60, indoor: false, status: 'maybe', rank, day: null, scoring: true, at: Date.now() }
    save('place', [temp], `${n} added`)
    setName('')
    close()
    try {
      const p = await scorePlace(trip, n, rank)
      if (p && places.get()[temp.id]) save('place', [{ ...p, id: temp.id, status: places.get()[temp.id].status, scoring: false }])
    } catch (e) {
      if (places.get()[temp.id]) save('place', [{ ...places.get()[temp.id], scoring: false, why: e instanceof Error ? `Not scored: ${e.message}` : 'Not scored yet.' }])
    } finally { setBusy(false) }
  }
  return (
    <Sheet title="Add a place">
      <p class="muted">Type a name you heard about. It appears in Maybe right away; Gemini scores it in a few seconds.</p>
      <div class="row"><input class="field grow" placeholder="e.g. Musée Grévin" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
        <button class="btn btn-primary btn-sm press" disabled={!name.trim() || busy} onClick={add}>{busy ? <Spinner /> : 'Add'}</button></div>
      {err && <p class="answer err">{err}</p>}
    </Sheet>
  )
}

export function DaySheet({ trip, id }: { trip: Trip; id: string }) {
  const p = places.use()[id]
  if (!p) return null
  const n = tripDays(trip)
  return (
    <Sheet title={`Day for ${p.name}`}>
      <div class="list">
        {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
          const date = dateOf(trip, d)
          const closed = hoursOn(p, date) === null || (p.fixed != null && !!p.booked && p.day != null && p.day !== d)
          const pl = planDay(trip, d, tripPlaces(trip.id))
          return (
            <button class="kv press" disabled={closed} style={closed ? { opacity: 0.5 } : undefined} onClick={() => { setDay(p.id, d); close() }}>
              <span><b>Day {d}</b> · {WEEKDAY[weekday(date)]} {shortDate(date)}</span>
              <span class="v">{p.day === d ? <span class="chip ok">Here</span> : p.fixed != null && p.booked ? 'Booked on another day' : closed ? 'Closed' : `${pl.slots.filter((s) => s.kind === 'place').length} stops`}</span>
            </button>
          )
        })}
      </div>
      {p.day != null && <button class="btn btn-quiet press" onClick={() => { setDay(p.id, null); close() }}>Not on a day</button>}
    </Sheet>
  )
}

export function MenuSheet({ id }: { id: string }) {
  const p = places.use()[id]
  if (!p) return null
  const after = () => close()
  return (
    <Sheet title={p.name}>
      <div class="list">
        <button class="kv press" onClick={() => { setDone(p.id, !p.done); after() }}><span>{p.done ? 'Not done yet' : 'Mark as done'}</span><Icon.check /></button>
        {p.status !== 'picked' && <button class="kv press" onClick={() => { setStatus(p.id, 'picked'); after() }}><span>Pick it</span></button>}
        {p.status !== 'maybe' && !p.must && <button class="kv press" onClick={() => { setStatus(p.id, 'maybe'); after() }}><span>Move to Maybe</span></button>}
        {p.must ? <button class="kv press" onClick={() => { pushDown(p.id); after() }}><span>Move to the bottom</span><span class="v">Must-sees can't be eliminated</span></button>
          : p.status !== 'out' && <button class="kv press" onClick={() => { setStatus(p.id, 'out'); after() }}><span style={{ color: 'var(--danger)' }}>Eliminate</span></button>}
      </div>
    </Sheet>
  )
}

export function RulesSheet({ trip }: { trip: Trip }) {
  const t = trips.use()[trip.id]
  return (
    <Sheet title={`Local rules · ${t.name}`}>
      {t.rules?.length ? <div class="list">{t.rules.map((r) => <div class="kv" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '12px 14px', gap: '2px' }}><b>{r.title}</b><span class="muted">{r.text}</span></div>)}</div>
        : <p class="muted">Written by Gemini once the list is built (needs the key and a connection).</p>}
    </Sheet>
  )
}

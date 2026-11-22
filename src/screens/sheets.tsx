// Small sheets: sort & filter, add a place, add to a day, pick a day, local rules.
import { useEffect, useState } from 'preact/hooks'
import { Icon, Sheet, Spinner } from '../ui'
import { nowIn, places, save, tripPlaces, trips } from '../lib/data'
import { close, open, replaceTop } from '../lib/nav'
import { createStore } from '../lib/store'
import { setDay } from '../lib/actions'
import { discover, scorePlace } from '../lib/ai'
import { deepSearch } from '../lib/deep'
import { locateAll } from '../lib/locate'
import { here, locate } from '../lib/here'
import { between, byRank } from '../lib/rank'
import { dateOf, dayPlaces, hoursOn, planDay, tripDays } from '../lib/planner'
import { km } from '../lib/geo'
import { shortDate, WEEKDAY, weekday } from '../lib/time'
import { symbol } from '../lib/money'
import type { Place, Trip } from '../lib/model'

export interface Filters { sort: 'mine' | 'worth' | 'value' | 'price' | 'distance' | 'must'; hideTraps: boolean; under?: number; kids: boolean; near: boolean; group?: boolean }
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
          <button class={`pill press${f.group !== false ? ' on' : ''}`} aria-pressed={f.group !== false} onClick={() => set({ group: f.group === false })}>Group by type</button>
        </div>
      </div>
    </Sheet>
  )
}

export function AddSheet({ trip, day }: { trip: Trip; day?: number }) {
  const [name, setName] = useState('')
  const add = async (status: 'picked' | 'maybe') => {
    const n = name.trim()
    if (!n) return
    // In the list at once ("Scoring…"); Gemini fills it in a few seconds.
    const last = tripPlaces(trip.id).sort(byRank).at(-1)
    const rank = between(last?.rank, undefined)
    const onDay = day ? dayPlaces(tripPlaces(trip.id), day).at(-1) : undefined
    const temp: Place = { id: crypto.randomUUID(), trip: trip.id, name: n, kind: 'sight', lat: trip.base?.lat ?? trip.dest.lat, lng: trip.base?.lng ?? trip.dest.lng, badge: 'worth', must: false, worth: 0, value: 0, sub: { iconic: 0, vibe: 0, hassle: 0, kid: 0 }, rec: 'pay', recText: '', why: '', tip: '', price: 0, minutes: 60, suggested: 60, indoor: false, status, rank, day: day ?? null, dayRank: day ? between(onDay?.dayRank, undefined) : undefined, scoring: true, at: Date.now() }
    save('place', [temp], `${n} added`)
    close()
    try {
      const p = await scorePlace(trip, n, rank)
      const cur = places.get()[temp.id]
      if (p && cur) save('place', [{ ...p, id: temp.id, status: cur.status, day: cur.day, dayRank: cur.dayRank, scoring: false }])
    } catch (e) {
      const cur = places.get()[temp.id]
      if (cur) save('place', [{ ...cur, scoring: false, why: e instanceof Error ? `Not scored: ${e.message}` : 'Not scored yet.' }])
    }
  }
  return (
    <Sheet title={day ? `Add to Day ${day}` : 'Add a place'}>
      <input class="field" autoFocus enterKeyHint="done" placeholder="Name, e.g. Musée Grévin" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') void add('picked') }} />
      <div class="row">
        <button class="btn btn-primary grow press" disabled={!name.trim()} onClick={() => add('picked')}>{day ? `Add to Day ${day}` : 'Add, checked'}</button>
        {!day && <button class="btn btn-quiet press" disabled={!name.trim()} onClick={() => add('maybe')}>Unchecked</button>}
      </div>
      <p class="muted small">Gemini scores it in a few seconds.</p>
    </Sheet>
  )
}

/** "+ Add to this day": places not planned yet, nearest to the day's stops first. One tap adds. */
export function AddToDaySheet({ trip, day }: { trip: Trip; day: number }) {
  const all = places.use()
  const list = tripPlaces(trip.id)
  const on = dayPlaces(list, day)
  const date = dateOf(trip, day)
  const centre = on.length ? { lat: on.reduce((a, p) => a + p.lat, 0) / on.length, lng: on.reduce((a, p) => a + p.lng, 0) / on.length } : trip.base ?? trip.dest
  const [added, setAdded] = useState<string[]>([])
  const candidates = list
    .filter((p) => (p.day == null || added.includes(p.id)) && p.status !== 'out' && !p.done && !p.scoring && hoursOn(p, date) !== null)
    .sort((a, b) => Number(b.must) - Number(a.must) || Number(b.status === 'picked') - Number(a.status === 'picked') || km(centre, a) - km(centre, b))
    .slice(0, 12)
  void all
  return (
    <Sheet title={`Add to Day ${day}`} foot={<button class="btn btn-primary grow press" onClick={close}>Done</button>}>
      {candidates.length === 0 ? <p class="muted">Everything open that day is already planned.</p> : (
        <div class="list">
          {candidates.map((p) => {
            const isOn = added.includes(p.id)
            return (
              <button class="kv press" aria-pressed={isOn} onClick={() => { if (isOn) { setDay(p.id, null); setAdded(added.filter((x) => x !== p.id)) } else { setDay(p.id, day); setAdded([...added, p.id]) } }}>
                <span class="stack" style={{ gap: '1px', minWidth: 0 }}><span class="strong">{p.name}</span><span class="muted small">{p.must ? '★ Must-see · ' : ''}{Math.round(km(centre, p) * 10) / 10} km · {p.minutes} min</span></span>
                {isOn ? <span class="chip ok"><Icon.check />Added</span> : <Icon.plus />}
              </button>
            )
          })}
        </div>
      )}
      <button class="link press" onClick={() => { close(); setTimeout(() => open({ kind: 'sheet', name: 'add', arg: trip.id + '|' + day }), 0) }}>Something else…</button>
    </Sheet>
  )
}

const FOCUS: [string, string][] = [
  ['Near us', 'great things within a short walk or drive of where they are, especially ones only locals know'],
  ['On our dates', 'things that happen only on or around their dates: seasonal wildlife (e.g. sea-turtle hatchling releases, whale watching), festivals, markets, events, sports'],
  ['Nature & wildlife', 'nature, beaches, wildlife and outdoor experiences'],
  ['Hidden gems', 'hidden gems and local favourites that tourists miss'],
  ['Free', 'free or nearly free things worth doing'],
  ['Rainy day', 'indoor things for a rainy or very hot day'],
]

/** "Find more": Gemini searches Google for one focus and adds up to 8 new places, unchecked and tagged New. */
export function DiscoverSheet({ trip }: { trip: Trip }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<{ busy?: string; done?: string; err?: string }>({})
  const loc = here.use()
  useEffect(() => { void locate() }, [])
  const add = (p: Place, last: { rank?: string }, found: string[]) => {
    last.rank = between(last.rank, undefined)
    save('place', [{ ...p, rank: last.rank, status: 'maybe', must: false, fresh: true }])
    found.push(p.name)
  }
  /** Every kind of place, one Google search each, plus real places nearby from the map. */
  const deep = async () => {
    setState({ busy: 'everything' })
    const last = { rank: tripPlaces(trip.id).sort(byRank).at(-1)?.rank }
    const found: string[] = []
    try {
      await deepSearch(trip, tripPlaces(trip.id), (p) => { if (p.badge !== 'trap') add(p, last, found) }, (done, running, total) => setState({ busy: running.length ? `${done.length + 1} of ${total}: ${running.join(', ')} (${found.length} new)` : `${done.length} of ${total} (${found.length} new)` }))
      setState({ done: found.length ? `Added ${found.length}, unchecked and tagged New.` : 'Nothing new: your list already has it all.' })
      void locateAll(trip).catch(() => {})
    } catch (e) { setState({ err: e instanceof Error ? e.message : 'Search failed.' }) }
  }
  const run = async (label: string, focus: string) => {
    setState({ busy: label })
    const all = tripPlaces(trip.id)
    const names = new Set(all.map((p) => p.name.toLowerCase()))
    let last = all.sort(byRank).at(-1)?.rank
    const found: string[] = []
    try {
      await discover(trip, focus, loc.pt ?? trip.base, all.map((p) => p.name), (p) => {
        if (names.has(p.name.toLowerCase()) || p.badge === 'trap' || found.length >= 8) return
        names.add(p.name.toLowerCase())
        last = between(last, undefined)
        save('place', [{ ...p, rank: last, status: 'maybe', must: false, fresh: true }])
        found.push(p.name)
      })
      setState({ done: found.length ? `Added ${found.length}, unchecked and tagged New: ${found.join(', ')}.` : 'Nothing new found for that. Try another.' })
    } catch (e) { setState({ err: e instanceof Error ? e.message : 'Search failed.' }) }
  }
  return (
    <Sheet title="Find more">
      <p class="muted small">Gemini searches Google for your dates and where you are.</p>
      <div class="row">
        <button class="btn btn-secondary grow press" disabled={!!state.busy} onClick={() => replaceTop({ kind: 'sheet', name: 'review' })}><Icon.check />Check my list</button>
        <button class="btn btn-primary grow press" disabled={!!state.busy} onClick={deep}><Icon.search />Search everything</button>
      </div>
      <p class="muted small" style={{ marginTop: '-6px' }}>Check: what's missing and what doesn't fit your vibe (1 min). Search everything: every kind of place, one search each (1–2 min).</p>
      <div class="chips">{FOCUS.map(([l, f]) => <button class="pill press" disabled={!!state.busy} onClick={() => run(l, f)}>{l}</button>)}</div>
      <div class="row">
        <input class="field grow" placeholder="Something specific, e.g. turtle release" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) void run(text.trim(), `specifically: ${text.trim()}`) }} />
        <button class="btn btn-primary btn-sm press" disabled={!text.trim() || !!state.busy} onClick={() => run(text.trim(), `specifically: ${text.trim()}`)}>Search</button>
      </div>
      {state.busy && <div class="row muted"><Spinner />Searching {state.busy}…</div>}
      {state.done && <p class="answer">{state.done}</p>}
      {state.err && <p class="answer err">{state.err}</p>}
    </Sheet>
  )
}

export function DaySheet({ trip, id }: { trip: Trip; id: string }) {
  const p = places.use()[id]
  if (!p) return null
  const n = tripDays(trip)
  // Days already behind you aren't offered: you can't go back in time.
  const first = Math.max(1, nowIn(trip).day)
  return (
    <Sheet title={`Day for ${p.name}`}>
      {first > n ? <p class="muted">The trip is over.</p> : (
      <div class="list">
        {Array.from({ length: n - first + 1 }, (_, i) => i + first).map((d) => {
          const date = dateOf(trip, d)
          const closed = hoursOn(p, date) === null || (p.fixed != null && !!p.booked && p.day != null && p.day !== d)
          const pl = planDay(trip, d, tripPlaces(trip.id))
          return (
            <button class="kv press" disabled={closed} style={closed ? { opacity: 0.5 } : undefined} onClick={() => { setDay(p.id, d); close() }}>
              <span><b>{d === first && nowIn(trip).day === d ? 'Today' : `Day ${d}`}</b> · {WEEKDAY[weekday(date)]} {shortDate(date)}</span>
              <span class="v">{p.day === d ? <span class="chip ok">Here</span> : p.fixed != null && p.booked ? 'Booked on another day' : closed ? 'Closed' : `${pl.slots.filter((s) => s.kind === 'place').length} stops`}</span>
            </button>
          )
        })}
      </div>
      )}
      {p.day != null && <button class="btn btn-quiet press" onClick={() => { setDay(p.id, null); close() }}>Not on a day</button>}
    </Sheet>
  )
}

export function RulesSheet({ trip }: { trip: Trip }) {
  const t = trips.use()[trip.id]
  return (
    <Sheet title={`Local rules · ${t.name}`}>
      {t.rules?.length ? <div class="list">{t.rules.map((r) => <div class="kv" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '12px 14px', gap: '2px' }}><b>{r.title}</b><span class="muted">{r.text}</span></div>)}</div>
        : <p class="muted">Written by Gemini with the list.</p>}
    </Sheet>
  )
}

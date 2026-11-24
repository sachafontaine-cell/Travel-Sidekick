// Small sheets: sort & filter, add a place, add to a day, pick a day, local rules.
import { useEffect, useState } from 'preact/hooks'
import { Icon, Sheet, Spinner, Stepper } from '../ui'
import { Clock24 } from './card'
import { findAddress } from '../lib/weather'
import { nowIn, places, save, tripPlaces, trips } from '../lib/data'
import { close, open } from '../lib/nav'
import { createStore } from '../lib/store'
import { setDay } from '../lib/actions'
import { discover, scorePlace } from '../lib/ai'
import { deepSearch } from '../lib/deep'
import { locateAll } from '../lib/locate'
import { here, locate } from '../lib/here'
import { between, byRank } from '../lib/rank'
import { dateOf, dayPlaces, hoursOn, planDay, tripDays } from '../lib/planner'
import { km } from '../lib/geo'
import { clock, duration, shortDate, WEEKDAY, weekday } from '../lib/time'
import { symbol } from '../lib/money'
import type { Place, Trip } from '../lib/model'

export interface Filters { sort: 'mine' | 'worth' | 'value' | 'price' | 'distance' | 'must'; hideTraps: boolean; under?: number; kids: boolean; near: boolean; group?: boolean }
export const filters = createStore<Filters>({ sort: 'mine', hideTraps: true, kids: false, near: false }, 'filters')

export function FilterSheet({ trip }: { trip: Trip }) {
  const f = filters.use()
  const set = (p: Partial<Filters>) => filters.set({ ...f, ...p })
  const sorts: [Filters['sort'], string][] = [['mine', 'Best first'], ['value', 'Best value'], ['price', 'Cheapest'], ['distance', 'Nearest home']]
  const cur = symbol(trip.dest.currency)
  return (
    <Sheet title="Sort & filter" foot={<button class="btn btn-quiet grow press" onClick={() => filters.set({ sort: 'mine', hideTraps: true, kids: false, near: false })}>Reset</button>}>
      <div class="stack"><span class="label">Sort</span><div class="chips">{sorts.map(([k, l]) => <button class={`pill press${f.sort === k ? ' on' : ''}`} aria-pressed={f.sort === k} onClick={() => set({ sort: k })}>{l}</button>)}</div>
</div>
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

/**
 * + Add: your own activity, written in by hand (name, day, time, length, where, note), with no
 * score and no Gemini. Or, for a place you heard about, "Look it up" and Gemini scores it.
 */
export function AddSheet({ trip, day: day0 }: { trip: Trip; day?: number }) {
  const now = nowIn(trip)
  const n = tripDays(trip)
  const first = Math.max(1, now.day)
  const [name, setName] = useState('')
  const [day, setDayN] = useState<number | null>(day0 ?? null)
  const [time, setTime] = useState<number | null>(null)
  const [minutes, setMinutes] = useState(60)
  const [where, setWhere] = useState('')
  const [spot, setSpot] = useState<{ name: string; lat: number; lng: number } | null>(null)
  const [hits, setHits] = useState<{ name: string; lat: number; lng: number }[]>([])
  const [note, setNote] = useState('')
  useEffect(() => {
    const q = where.trim()
    if (q.length < 3 || spot?.name === q) { setHits([]); return }
    const t = setTimeout(() => { void findAddress(q, trip.dest).then(setHits).catch(() => setHits([])) }, 450)
    return () => clearTimeout(t)
  }, [where])

  const rankAfter = () => between(tripPlaces(trip.id).sort(byRank).at(-1)?.rank, undefined)
  /** Your own: saved as written, on the day and time you chose. */
  const addOwn = () => {
    const nm = name.trim()
    if (!nm) return
    const at = spot ?? trip.base ?? trip.dest
    const onDay = day ? dayPlaces(tripPlaces(trip.id), day).at(-1) : undefined
    const p: Place = {
      id: crypto.randomUUID(), trip: trip.id, name: nm, kind: 'other', own: true, scoreV: 2, lat: at.lat, lng: at.lng, badge: 'worth', must: false,
      worth: 0, value: 0, sub: { iconic: 0, vibe: 0, hassle: 0, kid: 0 }, rec: 'pay', recText: '', why: '', tip: '', desc: note.trim() || undefined,
      price: 0, minutes, suggested: minutes, indoor: false, status: 'picked', rank: rankAfter(), day, dayRank: day ? between(onDay?.dayRank, undefined) : undefined,
      fixed: day && time != null ? time : null, loc: { src: spot ? 'osm' : 'none', address: spot?.name ?? (trip.base ? trip.base.name : undefined), at: Date.now() }, at: Date.now(),
    }
    save('place', [p], day ? `${nm} added to Day ${day}${time != null ? ` at ${clock(time)}` : ''}` : `${nm} added`)
    close()
  }
  /** A place you heard about: in the list at once ("Scoring…"); Gemini fills it in a few seconds. */
  const lookUp = async () => {
    const nm = name.trim()
    if (!nm) return
    const rank = rankAfter()
    const onDay = day ? dayPlaces(tripPlaces(trip.id), day).at(-1) : undefined
    const temp: Place = { id: crypto.randomUUID(), trip: trip.id, name: nm, kind: 'sight', lat: trip.base?.lat ?? trip.dest.lat, lng: trip.base?.lng ?? trip.dest.lng, badge: 'worth', must: false, worth: 0, value: 0, sub: { iconic: 0, vibe: 0, hassle: 0, kid: 0 }, rec: 'pay', recText: '', why: '', tip: '', price: 0, minutes, suggested: minutes, indoor: false, status: 'picked', rank, day, dayRank: day ? between(onDay?.dayRank, undefined) : undefined, fixed: day && time != null ? time : null, scoring: true, at: Date.now() }
    save('place', [temp], `${nm} added: looking it up`)
    close()
    try {
      const p = await scorePlace(trip, nm, rank)
      const cur = places.get()[temp.id]
      if (p && cur) save('place', [{ ...p, id: temp.id, status: cur.status, day: cur.day, dayRank: cur.dayRank, fixed: cur.fixed, minutes: cur.minutes, scoring: false }])
    } catch (e) {
      const cur = places.get()[temp.id]
      if (cur) save('place', [{ ...cur, scoring: false, why: e instanceof Error ? `Not scored: ${e.message}` : 'Not scored yet.' }])
    }
  }
  const days = Array.from({ length: Math.max(0, n - first + 1) }, (_, i) => i + first)
  return (
    <Sheet title="New activity">
      <input class="field" autoFocus enterKeyHint="next" placeholder="What? e.g. Dinner at Tía's, beach morning" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      <div class="stack" style={{ gap: '6px' }}>
        <span class="label">Day</span>
        <div class="strip chipstrip">
          <button class={`pill press${day == null ? ' on' : ''}`} onClick={() => setDayN(null)}>No day yet</button>
          {days.map((d) => <button class={`pill press${day === d ? ' on' : ''}`} onClick={() => setDayN(d)}>{d === now.day ? 'Today' : `${WEEKDAY[weekday(dateOf(trip, d))]} ${Number(dateOf(trip, d).slice(8))}`}</button>)}
        </div>
      </div>
      {day != null && (
        <div class="timerow">
          <span class="grow strong">Start</span>
          {time == null ? <button class="btn btn-quiet btn-sm press" onClick={() => setTime(Math.max(trip.dayStart, 9 * 60))}>Any time · set one</button>
            : <><Clock24 label="Start time" value={time} custom onChange={setTime} /><button class="link small press" onClick={() => setTime(null)}>Any time</button></>}
        </div>
      )}
      <Stepper label="How long" value={minutes} show={duration} step={15} min={15} max={720} onChange={setMinutes} />
      <div class="stack" style={{ gap: '6px' }}>
        <input class="field" placeholder={`Where? (optional${trip.base ? ', blank = home' : ''})`} value={where} onInput={(e) => { setWhere((e.target as HTMLInputElement).value); setSpot(null) }} />
        {hits.length > 0 && !spot && <div class="list">{hits.map((h) => <button class="kv press" onClick={() => { setSpot(h); setWhere(h.name); setHits([]) }}><span>{h.name}</span></button>)}</div>}
      </div>
      <textarea class="field" style={{ minHeight: '64px', paddingTop: '10px' }} placeholder="Notes (optional)" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
      <button class="btn btn-primary press" disabled={!name.trim()} onClick={addOwn}>Add</button>
      <button class="link press" style={{ alignSelf: 'center' }} disabled={!name.trim()} onClick={() => void lookUp()}>It's a place: look it up with Gemini</button>
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
      <button class="link press" onClick={() => { close(); setTimeout(() => open({ kind: 'sheet', name: 'add', arg: trip.id + '|' + day }), 0) }}>Write in your own…</button>
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
export function DiscoverSheet({ trip, q }: { trip: Trip; q?: string }) {
  const [text, setText] = useState(q ?? '')
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
      <div class="row">
        <input class="field grow" placeholder="Something specific, e.g. turtle release" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) void run(text.trim(), `specifically: ${text.trim()}`) }} />
        <button class="btn btn-primary btn-sm press" disabled={!text.trim() || !!state.busy} onClick={() => run(text.trim(), `specifically: ${text.trim()}`)}>Search</button>
      </div>
      <div class="chips">{FOCUS.map(([l, f]) => <button class="pill press" disabled={!!state.busy} onClick={() => run(l, f)}>{l}</button>)}</div>
      <button class="kv press card" style={{ borderRadius: '14px' }} disabled={!!state.busy} onClick={deep}>
        <span class="row" style={{ gap: '10px' }}><Icon.search /><span class="stack" style={{ gap: '1px', textAlign: 'left' }}><b>Search everything</b><span class="muted small">Every kind of place, one Google search each · 2 min</span></span></span><Icon.chev />
      </button>
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
          // Only another day's booking is off limits; "closed" is a warning (the hours can be wrong).
          const locked = p.fixed != null && !!p.booked && p.day != null && p.day !== d
          const closed = hoursOn(p, date) === null
          const pl = planDay(trip, d, tripPlaces(trip.id))
          return (
            <button class="kv press" disabled={locked} style={locked ? { opacity: 0.5 } : undefined} onClick={() => { setDay(p.id, d); close() }}>
              <span><b>{d === first && nowIn(trip).day === d ? 'Today' : `Day ${d}`}</b> · {WEEKDAY[weekday(date)]} {shortDate(date)}</span>
              <span class="v">{p.day === d ? <span class="chip ok">Here</span> : p.fixed != null && p.booked ? 'Booked on another day' : closed ? <span class="warn-text">Closed?</span> : (() => { const k = pl.slots.filter((s) => s.kind === 'place').length; return k ? `${k} stop${k === 1 ? '' : 's'}` : 'Free' })()}</span>
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

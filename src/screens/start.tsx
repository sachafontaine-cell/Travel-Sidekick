// First run: build the list (bookings + Gemini), plan the days, then confirm the must-sees.
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon, Spinner } from '../ui'
import { save, settings, trips, tripPlaces } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { buildList, scorePlace } from '../lib/ai'
import { autoPlan } from '../lib/rebalance'
import { fetchBookings, connected, type Booking } from '../lib/sync'
import { between } from '../lib/rank'
import { parseClock } from '../lib/time'
import { dayIndex } from '../lib/planner'
import type { Place, Trip } from '../lib/model'

type Step = { text: string; done: boolean }

export function bookingPlace(b: Booking, trip: Trip, rank: string): Place | null {
  const day = dayIndex(trip, b.date)
  const time = b.time ? parseClock(b.time) : null
  if (b.kind === 'hotel' || day < 1 || day > 99 || time == null || b.lat == null || b.lng == null) return null
  return {
    id: crypto.randomUUID(), trip: trip.id, name: b.name, kind: b.kind === 'meal' ? 'meal' : 'other', lat: b.lat, lng: b.lng, badge: 'worth', must: false,
    worth: 7, value: 7, sub: { iconic: 5, vibe: 5, hassle: 5, kid: 5 }, rec: 'pay', recText: 'Already booked.', why: b.note ?? '', tip: '',
    price: 0, minutes: b.kind === 'flight' ? 60 : 90, suggested: 90, indoor: true, status: 'picked', rank, day, dayRank: 'a', fixed: time, booked: 'Booked · from your email', at: Date.now(),
  }
}

export function Start({ trip }: { trip: Trip }) {
  const s = settings.use()
  const [steps, setSteps] = useState<Step[]>([])
  const [found, setFound] = useState<Place[]>([])
  const [phase, setPhase] = useState<'idle' | 'building' | 'confirm' | 'error'>('idle')
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState('')
  const [busyAdd, setBusyAdd] = useState(false)
  const started = useRef(false)

  const step = (i: number, text: string, done = false) => setSteps((st) => { const n = [...st]; n[i] = { text, done }; return n })

  const run = async () => {
    setPhase('building'); setErr(''); setSteps([]); setFound([])
    // Bookings already on the trip (from Find my trips) stay, and aren't added twice.
    const all: Place[] = tripPlaces(trip.id)
    const names = new Set<string>(all.map((p) => p.name.toLowerCase()))
    let base = trip.base
    try {
      let i = 0
      if (connected()) {
        step(i, 'Reading bookings from your email…')
        try {
          const bookings = await fetchBookings(trip.dest.name, trip.start, trip.end)
          let rank: string | undefined
          for (const b of bookings) {
            if (b.kind === 'hotel' && b.lat != null && b.lng != null && !base) base = { name: b.name, lat: b.lat, lng: b.lng }
            rank = between(rank, undefined)
            const p = bookingPlace(b, trip, 'a' + rank)
            if (p) { all.push(p); names.add(p.name.toLowerCase()) }
          }
          step(i, `Read ${bookings.length} booking${bookings.length === 1 ? '' : 's'} from your email`, true)
        } catch (e) { step(i, `Could not read your email (${e instanceof Error ? e.message : 'unknown error'}). Skipped; try again from the Trip tab.`, true) }
        i++
      }
      step(i, 'Finding places for your family…')
      const n = await buildList(trip, (p) => {
        const k = p.name.toLowerCase()
        if (names.has(k)) return
        names.add(k); all.push(p)
        setFound([...all])
        step(i, `Finding places for your family… ${all.length}`)
      })
      step(i, `Found ${n} places for your family`, true)
      step(i + 1, 'Planning the days…')
      const planned = autoPlan({ ...trip, base }, all)
      setFound(planned)
      step(i + 1, 'Days planned (hours checked with Google each morning)', true)
      if (base !== trip.base) save('trip', [{ ...trips.get()[trip.id], base }])
      setPhase('confirm')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
      setPhase('error')
    }
  }

  useEffect(() => { if (s.geminiKey && !started.current) { started.current = true; void run() } }, [s.geminiKey])

  const musts = found.filter((p) => p.must || p.badge === 'must')
  const toggle = (p: Place) => setFound(found.map((x) => (x.id === p.id ? { ...x, must: !x.must } : x)))
  const addMust = async () => {
    const name = adding.trim()
    if (!name) return
    setBusyAdd(true)
    try {
      const last = [...found].sort((a, b) => (a.rank < b.rank ? -1 : 1)).at(-1)
      const p = await scorePlace(trip, name, between(last?.rank, undefined))
      if (p) setFound([...found, { ...p, must: true, status: 'picked' }])
      setAdding('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add it.') } finally { setBusyAdd(false) }
  }
  const finish = () => {
    // Unticked must-sees stay in the list as ordinary picks.
    const final = autoPlan(trip, found.map((p) => ({ ...p, day: p.fixed != null ? p.day : null })))
    save('place', final)
    save('trip', [{ ...trips.get()[trip.id], built: true }])
    go(tripPath(trip.id, 'plan'), true)
  }

  return (
    <main class="main" style={{ paddingBottom: '32px' }}>
      <div class="row">
        <button class="iconbtn ring press" aria-label="Back to setup" onClick={() => go(tripPath(trip.id, 'setup'), true)}><Icon.back /></button>
        <h1 class="h1 grow">Building your {trip.name} list</h1>
      </div>
      {!s.geminiKey ? (
        <div class="card card-pad stack">
          <p>The list is made by Gemini (free). Add your key once; both phones share it.</p>
          <button class="btn btn-primary press" onClick={() => open({ kind: 'sheet', name: 'app' })}>Add the Gemini key</button>
        </div>
      ) : (
        <>
          <p class="muted">About 20 seconds, once per trip. Everything after this is instant.</p>
          <div class="card card-pad stack">
            {steps.map((st) => <div class="row">{st.done ? <span style={{ color: 'var(--success)' }}><Icon.check /></span> : <Spinner />}<span class={st.done ? '' : 'hint'}>{st.text}</span></div>)}
            {phase === 'error' && <><p class="answer err">{err}</p><button class="btn btn-primary press" onClick={run}>Try again</button></>}
          </div>
        </>
      )}
      {phase === 'confirm' && (
        <>
          <span class="label">Your must-sees ({musts.filter((p) => p.must).length}) · untick any</span>
          <div class="list">
            {musts.map((p) => (
              <label class="check"><input type="checkbox" checked={p.must} onChange={() => toggle(p)} /><span class="grow"><span class="strong">{p.name}</span><br /><span class="muted small">{p.why}</span></span></label>
            ))}
          </div>
          <div class="row">
            <input class="field grow" placeholder="Add a must-see" value={adding} onInput={(e) => setAdding((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') void addMust() }} />
            <button class="btn btn-quiet btn-sm press" disabled={!adding.trim() || busyAdd} onClick={addMust}>{busyAdd ? <Spinner /> : 'Add'}</button>
          </div>
          {err && <p class="answer err">{err}</p>}
          <button class="btn btn-primary press" onClick={finish}>Looks good</button>
          <p class="muted small" style={{ textAlign: 'center' }}>Change any later with the star on its card.</p>
        </>
      )}
    </main>
  )
}

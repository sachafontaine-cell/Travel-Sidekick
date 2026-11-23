// First run: build the list (bookings + Gemini), plan the days, then confirm the must-sees.
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon, Spinner } from '../ui'
import { save, settings, trips, tripPlaces } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { scorePlace, listKey } from '../lib/ai'
import { deepSearch } from '../lib/deep'
import { locateAll } from '../lib/locate'
import { autoPlan } from '../lib/rebalance'
import { connected, scanEmail } from '../lib/sync'
import { between, spread } from '../lib/rank'
import type { Place, Trip } from '../lib/model'

type Step = { text: string; done: boolean }

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
    let base = trip.base
    try {
      let i = 0
      if (connected()) {
        // Email is read by the family script in the background: nothing here waits for it.
        void scanEmail().catch(() => {})
        step(i, 'Bookings from your email', true)
        i++
      }
      step(i, 'Searching Google, one kind of place at a time…')
      let rank: string | undefined
      const n = await deepSearch(trip, all, (p) => {
        rank = between(rank, undefined)
        all.push({ ...p, rank })
        setFound([...all])
      }, (done, running, total) => step(i, running.length ? `Searching ${done.length + 1} of ${total}: ${running.join(', ')}… (${all.length} places)` : `Searched ${done.length} of ${total}… (${all.length} places)`))
      step(i, `Found ${n} places for your family`, true)
      step(i + 1, 'Planning the days…')
      // Best first in "My order": must-sees, then by worth.
      const keys = spread(all.length)
      const ordered = [...all].sort((a, b) => Number(b.must) - Number(a.must) || b.worth - a.worth).map((p, k) => (p.booked ? p : { ...p, rank: keys[k] }))
      const planned = autoPlan({ ...trip, base }, ordered)
      setFound(planned)
      step(i + 1, 'Days planned', true)
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
    save('trip', [{ ...trips.get()[trip.id], built: true, listFor: listKey(trips.get()[trip.id]) }])
    void locateAll(trips.get()[trip.id]).catch(() => {})
    go(tripPath(trip.id, 'ideas'), true)
  }

  return (
    <main class="main" style={{ paddingBottom: '32px' }}>
      <div class="row">
        <button class="iconbtn ring press" aria-label="Back to setup" onClick={() => go(tripPath(trip.id, 'setup'), true)}><Icon.back /></button>
        <h1 class="h1 grow">Building your {trip.name} list</h1>
      </div>
      {!s.geminiKey ? (
        <div class="card card-pad stack">
          <p>Gemini (free) builds the list. Add your key once.</p>
          <button class="btn btn-primary press" onClick={() => open({ kind: 'sheet', name: 'app', arg: 'key' })}>Add the Gemini key</button>
        </div>
      ) : (
        <>
          <p class="muted">About 1–2 minutes, once per trip: it searches Google for each kind of place.</p>
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

// Check my list: Gemini (searching Google) reviews the whole list for this trip. A verdict, then
// what's missing (Add), what doesn't fit your vibe (Skip), and what to double-check (Skip).
import { useEffect, useState } from 'preact/hooks'
import { Icon, Sheet, Spinner } from '../ui'
import { places, save, tripPlaces } from '../lib/data'
import { open } from '../lib/nav'
import { setStatus } from '../lib/actions'
import { reviewList, type Review } from '../lib/ai'
import { between, byRank } from '../lib/rank'
import { isDup } from '../lib/deep'
import { nameMatch } from '../lib/photos'
import { locateAll } from '../lib/locate'
import type { Place, Trip } from '../lib/model'

/** The list place a review line names ("exact name", or close to it). */
function find(trip: Trip, name: string): Place | undefined {
  const all = tripPlaces(trip.id)
  const n = name.toLowerCase()
  return all.find((p) => p.name.toLowerCase() === n) ?? all.map((p) => ({ p, s: Math.max(nameMatch(name, p.name), nameMatch(p.name, name)) })).filter((x) => x.s >= 0.6).sort((a, b) => b.s - a.s)[0]?.p
}

export function ReviewSheet({ trip }: { trip: Trip }) {
  const ps = places.use()
  const [items, setItems] = useState<Review[]>([])
  const [state, setState] = useState<'busy' | 'done' | string>('busy')
  const [added, setAdded] = useState<string[]>([])

  useEffect(() => {
    const list = tripPlaces(trip.id).filter((p) => p.status !== 'out' && !(p.booked && p.kind === 'other'))
    const got: Review[] = []
    reviewList(trip, list, (r) => {
      // Missing ones already in the list (under another name) aren't missing.
      if (r.type === 'missing' && isDup(r.place, tripPlaces(trip.id))) return
      got.push(r); setItems([...got])
    }).then(() => setState('done'), (e) => setState(e instanceof Error ? e.message : 'Review failed.'))
  }, [])

  const add = (p: Place) => {
    const last = tripPlaces(trip.id).sort(byRank).at(-1)?.rank
    save('place', [{ ...p, rank: between(last, undefined), status: 'maybe', must: false, fresh: true }])
    setAdded((a) => [...a, p.name])
    void locateAll(trip).catch(() => {})
  }
  const summary = items.find((r) => r.type === 'summary') as { text: string } | undefined
  const missing = items.filter((r): r is { type: 'missing'; place: Place } => r.type === 'missing')
  const drop = items.filter((r): r is { type: 'drop'; name: string; reason: string } => r.type === 'drop')
  const check = items.filter((r): r is { type: 'check'; name: string; reason: string } => r.type === 'check')
  const toAdd = missing.filter((m) => !added.includes(m.place.name))

  const Flag = ({ r }: { r: { name: string; reason: string } }) => {
    const p = find(trip, r.name)
    const cur = p ? ps[p.id] : undefined
    return (
      <div class="kv" style={{ alignItems: 'flex-start', padding: '10px 14px', gap: '10px' }}>
        <button class="stack grow press" style={{ gap: '2px', textAlign: 'left', minWidth: 0 }} disabled={!cur} onClick={() => cur && open({ kind: 'card', place: cur.id })}><b>{r.name}</b><span class="muted small">{r.reason}</span></button>
        {cur && (cur.status === 'out' ? <span class="chip plain">Skipped</span> : cur.must ? <span class="chip star">Must-see</span>
          : <button class="btn btn-quiet btn-sm press" onClick={() => setStatus(cur.id, 'out')}>Skip it</button>)}
      </div>
    )
  }

  return (
    <Sheet title="Check my list">
      {state === 'busy' && <div class="row muted"><Spinner />Gemini is searching Google and reading your list… (up to a minute)</div>}
      {typeof state === 'string' && state !== 'busy' && state !== 'done' && <p class="answer err">{state}</p>}
      {summary && <p class="answer">{summary.text}</p>}

      {missing.length > 0 && (
        <div class="stack">
          <div class="between"><span class="label">Missing ({missing.length})</span>{toAdd.length > 1 && <button class="link small press" onClick={() => toAdd.forEach((m) => add(m.place))}>Add all</button>}</div>
          <div class="list">
            {missing.map(({ place: p }) => (
              <div class="kv" style={{ alignItems: 'flex-start', padding: '10px 14px', gap: '10px' }}>
                <span class="stack grow" style={{ gap: '2px', minWidth: 0 }}><b>{p.name}</b><span class="muted small">{p.good ?? p.why}</span></span>
                {added.includes(p.name) ? <span class="chip ok"><Icon.check />Added</span> : <button class="btn btn-primary btn-sm press" onClick={() => add(p)}><Icon.plus />Add</button>}
              </div>
            ))}
          </div>
          <span class="muted small">Added ones come in unchecked, tagged New.</span>
        </div>
      )}
      {drop.length > 0 && (
        <div class="stack"><span class="label">Doesn't fit your vibe ({drop.length})</span><div class="list">{drop.map((r) => <Flag r={r} />)}</div></div>
      )}
      {check.length > 0 && (
        <div class="stack"><span class="label">Double-check ({check.length})</span><div class="list">{check.map((r) => <Flag r={r} />)}</div></div>
      )}
      {state === 'done' && !missing.length && !drop.length && !check.length && <p class="muted">Nothing to change.</p>}
    </Sheet>
  )
}

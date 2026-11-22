// Rebalance: the one screen for Days (Review), must-sees (Fix it), and later rain and flights.
// Every change can be unticked; Apply, then Undo from the toast if needed.
import { useMemo, useState } from 'preact/hooks'
import { Sheet } from '../ui'
import { days, nowIn, places, tripPlaces } from '../lib/data'
import { close } from '../lib/nav'
import { applyProposal } from '../lib/actions'
import { rebalance } from '../lib/rebalance'
import { clock } from '../lib/time'
import type { Trip } from '../lib/model'

const where = (d: number | null, t?: number) => (d == null ? 'Not planned' : `Day ${d}${t != null ? ` · ${clock(t)}` : ''}`)

export function Rebalance({ trip }: { trip: Trip }) {
  const now = nowIn(trip)
  const pr = useMemo(() => rebalance(trip, tripPlaces(trip.id), days.get(), now.day, now.min), [])
  const [off, setOff] = useState<Set<string>>(new Set())
  places.use()
  const keep = pr.changes.filter((c) => !off.has(c.id))
  const first = Math.max(1, now.day + 1)
  return (
    <Sheet title={`Rebalance${pr.changes.length ? ` Days ${first}–${Math.max(first, ...pr.changes.map((c) => c.to.day ?? c.from.day ?? first))}` : ''}`}
      foot={pr.changes.length ? <>
        <button class="btn btn-primary press" style={{ flex: 2 }} disabled={!keep.length} onClick={() => { applyProposal({ ...pr, places: pr.places.filter((p) => !off.has(p.id)) }); close() }}>Apply {keep.length} change{keep.length === 1 ? '' : 's'}</button>
        <button class="btn btn-secondary press" style={{ flex: 1 }} onClick={close}>Not now</button>
      </> : undefined}>
      {pr.changes.length ? <p class="muted">Keeps bookings, hours, downtime and walking limit. Today stays as is.</p>
        : <p>All good: every must-see fits.</p>}
      {pr.changes.map((c) => (
        <label class="check card" style={{ alignItems: 'flex-start', padding: '12px' }}>
          <input type="checkbox" checked={!off.has(c.id)} onChange={() => { const n = new Set(off); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setOff(n) }} />
          <span class="grow stack" style={{ gap: '2px' }}>
            <b>{c.name}</b>
            <span class="small"><span class="muted" style={{ textDecoration: 'line-through' }}>{where(c.from.day, c.from.time)}</span> → <b>{where(c.to.day, c.to.time)}</b></span>
            <span class="muted small">{c.why}</span>
          </span>
        </label>
      ))}
      {pr.note && <p class="answer err">{pr.note}</p>}
    </Sheet>
  )
}

// Decide: one place at a time, best first, with what you need to choose: photos, what it is for
// your group, Great for / Skip if, worth, price for everyone, time there, distance from home,
// closing days, and what the other phone said. Want · Maybe · Skip, with Undo.
import { useEffect, useState } from 'preact/hooks'
import { BadgeFull, Dialog, Icon } from '../ui'
import { places, save, settings, tripPlaces } from '../lib/data'
import { close } from '../lib/nav'
import { fillAbout } from '../lib/about'
import { photoFor } from '../lib/background'
import { capacity, capacityText } from '../lib/capacity'
import { closedDays } from '../lib/planner'
import { duration } from '../lib/time'
import { price } from '../lib/money'
import { legText } from '../lib/geo'
import { travelFrom } from '../lib/routes'
import { groupOf } from '../lib/groups'
import { GROUP_COLOR, GROUP_NAME } from '../lib/groupStyle'
import type { Place, Status, Trip } from '../lib/model'
import { GoodSkip, Photos, Votes } from './card'

/** Places still to decide: unchecked ones this phone hasn't voted on (or the checked ones too). */
export function queueFor(trip: Trip, me: string | undefined, checked = false): string[] {
  const others = (p: Place) => Object.entries(p.votes ?? {}).some(([who, v]) => who !== me && v === 'picked')
  return tripPlaces(trip.id)
    .filter((p) => !p.booked && !p.scoring && !p.done && p.status !== 'out' && (checked ? p.status === 'picked' : p.status === 'maybe') && !(me && p.votes?.[me]))
    .sort((a, b) => Number(b.must) - Number(a.must) || Number(others(b)) - Number(others(a)) || b.worth - a.worth)
    .map((p) => p.id)
}

export function Decide({ trip }: { trip: Trip }) {
  const ps = places.use()
  const me = settings.get().me
  const [ids, setIds] = useState(() => queueFor(trip, me))
  const [i, setI] = useState(0)
  const [hist, setHist] = useState<Place[]>([])
  const p = ps[ids[i]]
  // Descriptions for the next few (one request), photos for the next two.
  useEffect(() => {
    void fillAbout(trip, ids.slice(i, i + 6).map((id) => places.get()[id]).filter(Boolean))
    for (const id of ids.slice(i, i + 2)) { const q = places.get()[id]; if (q && !q.photos) void photoFor(q, trip) }
  }, [i, ids])

  const pick = (s: Status) => {
    if (!p) return
    setHist([...hist, p])
    save('place', [{ ...p, status: s, votes: me ? { ...p.votes, [me]: s } : p.votes, ...(s === 'out' ? { day: null } : {}) }])
    setI(i + 1)
  }
  const undo = () => {
    const prev = hist.at(-1)
    if (!prev) return
    save('place', [prev])
    setHist(hist.slice(0, -1))
    setI(i - 1)
  }
  const cap = capacity(trip, tripPlaces(trip.id))
  const couple = trip.people.filter((x) => x.age >= 18).length > 1

  if (!p) {
    const wanted = hist.filter((h) => ps[h.id]?.status === 'picked').length
    return (
      <Dialog label="Decide">
        <div class="between"><h2 class="h2">{ids.length ? 'All decided' : 'Nothing to decide'}</h2><button class="iconbtn ring press" aria-label="Close" onClick={close}><Icon.x /></button></div>
        {hist.length > 0 && <p>{wanted} wanted out of {hist.length}.</p>}
        <p class="muted">{capacityText(cap)}.</p>
        <p class="muted small">Then tap <b>Plan my days</b> in the list to fit what you want into the days.</p>
        <button class="btn btn-quiet press" onClick={() => { setIds(queueFor(trip, me, true)); setI(0); setHist([]) }}>Go through the checked ones too</button>
        {hist.length > 0 && <button class="link press" onClick={undo}>Undo the last one</button>}
        <button class="btn btn-primary press" onClick={close}>Done</button>
      </Dialog>
    )
  }

  const g = groupOf(p)
  const t = trip.base ? travelFrom(trip, p, trip.base) : null
  const closed = closedDays(p)
  const group = p.price * Math.max(1, trip.people.length)
  return (
    <Dialog label={`Decide: ${p.name}`}>
      <div class="decide">
        <div class="between">
          <span class="muted small">{i + 1} of {ids.length} · {capacityText(cap)}</span>
          <button class="iconbtn ring press" aria-label="Close" onClick={close}><Icon.x /></button>
        </div>
        <Photos p={p} maps={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${trip.dest.name}`)}`} />
        <h2 class="h2">{p.must ? '★ ' : ''}{p.name}</h2>
        <div class="row" style={{ flexWrap: 'wrap', gap: '6px' }}>
          <span class="chip plain"><span class="dot" style={{ background: GROUP_COLOR[g] }} />{GROUP_NAME[g]}</span>
          {p.badge !== 'worth' && <BadgeFull p={p} />}
          {p.fresh && <span class="chip ok">New</span>}
        </div>
        <div class="facts">
          <div><span class="muted small">Worth it</span><b>{p.worth}/10</b></div>
          <div><span class="muted small">Price</span><b>{p.price ? `${price(trip, group, false)} for ${trip.people.length}` : 'Free'}</b></div>
          <div><span class="muted small">Time there</span><b>{duration(p.minutes)}</b></div>
          {t && <div><span class="muted small">From home</span><b>≈{legText(t)}</b></div>}
        </div>
        {closed.length > 0 && <p class="small warn-text">Closed {closed.join(', ')}</p>}
        {p.desc ? <p class="desc">{p.desc}</p> : <p class="muted small">Getting a description for your group…</p>}
        <GoodSkip p={p} />
        <Votes p={p} />
        {p.tip && <p class="small"><b>Tip:</b> {p.tip}</p>}
        {!me && couple && <p class="muted small">Set who this phone is (⚙ → This phone) and you'll each see what the other picked.</p>}
        <div class="decide-foot">
          <div class="decide-btns">
            <button class="btn btn-quiet press" disabled={p.must} title={p.must ? "Must-sees can't be skipped" : undefined} onClick={() => pick('out')}><Icon.x />Skip</button>
            <button class="btn btn-quiet press" onClick={() => pick('maybe')}>Maybe</button>
            <button class="btn btn-primary press" onClick={() => pick('picked')}><Icon.check />Want</button>
          </div>
          <div class="row" style={{ gap: '18px' }}>
            {hist.length > 0 && <button class="link small press" onClick={undo}>Undo</button>}
            <button class="link small press" onClick={() => { setHist([...hist, p]); save('place', [{ ...p, done: true }]); setI(i + 1) }}>Already done</button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

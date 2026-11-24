// Ideas: everything worth doing on this trip, to choose from. One job: decide what you want.
// Search, one row of type chips, the list (or the same places on a map). Check = want it;
// "Plan my days" fits what you want into the Days tab.
import { useEffect, useState } from 'preact/hooks'
import { createStore } from '../lib/store'
import { Icon, Spinner } from '../ui'
import { refreshList, refreshing, stale } from '../lib/refresh'
import { travelFrom } from '../lib/routes'
import { here, locate } from '../lib/here'
import { capacity, capacityText } from '../lib/capacity'
import { queueFor } from './decide'
import { days, nowIn, places, save, settings, tripPlaces, trips } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { pushDown, setStatus } from '../lib/actions'
import { swipeable } from '../lib/gestures'
import { planChecked, planPending } from '../lib/rebalance'
import { tripDays } from '../lib/planner'
import { short } from '../lib/money'
import { km, legText } from '../lib/geo'
import { groupOf, type Group } from '../lib/groups'
import { GROUP_COLOR, GROUP_LIST } from '../lib/groupStyle'
import { filters, type Filters } from './sheets'
import { TripBar } from './tripbar'
import type { Place, Trip } from '../lib/model'

/** Which chip is on (all, must-sees, or one type) and the search text. Kept while the app is open. */
const view = createStore<{ chip: Group | 'all' | 'must' | 'done'; q: string }>({ chip: 'all', q: '' })

/** Best first: must-sees, then by score; done ones last. Other sorts from Sort & filter. */
function sortList(list: Place[], f: Filters, trip: Trip): Place[] {
  const base = trip.base ?? trip.dest
  const s = [...list]
  if (f.sort === 'value') s.sort((a, b) => b.value - a.value)
  else if (f.sort === 'price') s.sort((a, b) => a.price - b.price)
  else if (f.sort === 'distance') s.sort((a, b) => km(base, a) - km(base, b))
  else s.sort((a, b) => Number(!!a.done) - Number(!!b.done) || Number(b.must) - Number(a.must) || b.worth - a.worth)
  return s.filter((p) => (!f.hideTraps || p.badge !== 'trap') && (!f.under || p.price <= f.under) && (!f.kids || p.sub.kid >= 7) && (!f.near || km(base, p) < 1.5))
}

const words = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Ideas({ trip, map }: { trip: Trip; map: boolean }) {
  places.use(); days.use(); trips.use()
  return (
    <main class="main">
      <TripBar />
      <div class="titlerow">
        <h1 class="h1">Ideas</h1>
        <div class="seg mini" role="tablist" aria-label="View">
          <button role="tab" aria-selected={!map} class={!map ? 'on press' : 'press'} onClick={() => go(tripPath(trip.id, 'ideas'), true)}>List</button>
          <button role="tab" aria-selected={map} class={map ? 'on press' : 'press'} onClick={() => go(tripPath(trip.id, 'ideas/map'), true)}><Icon.pin />Map</button>
        </div>
      </div>
      {map ? <MapLazy trip={trip} /> : <List trip={trip} />}
    </main>
  )
}

/** The map and its library load only the first time Map is opened (keeps Ideas fast). */
let MapView: ((p: { trip: Trip }) => preact.JSX.Element) | null = null
function MapLazy({ trip }: { trip: Trip }) {
  const [, ready] = useState(!!MapView)
  useEffect(() => { if (!MapView) void import('./map').then((m) => { MapView = m.MapView; ready(true) }) }, [])
  return MapView ? <MapView trip={trip} /> : <div class="mapbox loading"><Spinner /></div>
}

function List({ trip }: { trip: Trip }) {
  const f = filters.use()
  const v = view.use()
  here.use()
  // Times on each row are from where you are now.
  useEffect(() => { void locate() }, [])
  const [showOut, setShowOut] = useState(false)
  const all = tripPlaces(trip.id).filter((p) => !(p.booked && p.kind === 'other'))
  const live = all.filter((p) => p.status !== 'out')
  const q = words(v.q.trim())
  const match = (p: Place) => (!q || words(p.name).includes(q)) && (v.chip === 'all' ? true : v.chip === 'done' ? !!p.done : v.chip === 'must' ? p.must : groupOf(p) === v.chip)
  const list = sortList(live.filter(match), f, trip)
  const out = sortList(all.filter((p) => p.status === 'out' && match(p)), { ...f, hideTraps: false }, trip)
  const custom = f.sort !== 'mine' || f.hideTraps === false || !!f.under || f.kids || f.near
  const wanted = live.filter((p) => p.status === 'picked').length
  const toDecide = queueFor(trip, settings.get().me).length
  const cap = capacity(trip, all)
  const count = (g: Group) => live.filter((p) => groupOf(p) === g).length
  const doneN = live.filter((p) => p.done).length
  const chips: [Group | 'all' | 'must' | 'done', string, string?][] = [
    ['all', `All ${live.length}`],
    ...(doneN ? [['done', `✓ Done ${doneN}`] as [Group | 'all' | 'must' | 'done', string]] : []),
    ...(live.some((p) => p.must) ? [['must', `★ Must-sees`] as [Group | 'all' | 'must', string]] : []),
    ...GROUP_LIST.filter(([g]) => count(g) > 0).map(([g, name, c]) => [g, `${name} ${count(g)}`, c] as [Group, string, string]),
  ]
  const chip = (c: Group | 'all' | 'must' | 'done') => view.set({ ...v, chip: v.chip === c && c !== 'all' ? 'all' : c })

  return (
    <>
      <RefreshBanner trip={trip} />
      <div class="searchrow">
        <span class="search"><Icon.search /><input type="search" placeholder="Search your ideas" aria-label="Search your ideas" value={v.q} onInput={(e) => view.set({ ...v, q: (e.target as HTMLInputElement).value })} /></span>
        <button class="pill press" onClick={() => open({ kind: 'sheet', name: 'discover', arg: v.q.trim() || undefined })}><Icon.plus />Find more</button>
      </div>
      <div class="strip chipstrip" role="group" aria-label="Show">
        {chips.map(([c, label, color]) => <button class={`pill press${v.chip === c ? ' on' : ''}`} aria-pressed={v.chip === c} onClick={() => chip(c)}>{color && <span class="dot" style={{ background: color }} />}{label}</button>)}
      </div>

      {toDecide > 0 && !q && (
        <button class="decide-cta press" onClick={() => open({ kind: 'sheet', name: 'decide' })}>
          <span class="grow stack" style={{ gap: '2px', textAlign: 'left' }}><b>Help me choose</b><span class="muted small">{toDecide} to look at, one at a time</span></span>
          <Icon.chev />
        </button>
      )}

      <div class="listhead">
        <span class="grow stack" style={{ gap: '1px' }}><b>{wanted} wanted</b><span class={`small ${cap.left < -60 ? 'warn-text' : 'muted'}`}>{capacityText(cap)}</span></span>
        <button class={`iconbtn ring press${custom ? ' on' : ''}`} aria-label="Sort & filter" onClick={() => open({ kind: 'sheet', name: 'filter' })}><Icon.filter /></button>
        <button class="iconbtn ring press" aria-label="New activity" onClick={() => open({ kind: 'sheet', name: 'add', arg: trip.id })}><Icon.plus /></button>
      </div>
      {list.length > 0 ? <div class="list">{list.map((p) => <Row trip={trip} p={p} />)}</div> : (
        <div class="empty">
          <p>{q ? `Nothing called "${v.q.trim()}" yet.` : 'Nothing here yet.'}</p>
          <button class="btn btn-primary press" onClick={() => open({ kind: 'sheet', name: 'discover', arg: v.q.trim() || undefined })}><Icon.search />{q ? `Search Google for "${v.q.trim()}"` : 'Find more'}</button>
        </div>
      )}

      {out.length > 0 && <button class="fold press" aria-expanded={showOut} onClick={() => setShowOut(!showOut)}>Skipped ({out.length}){showOut ? <Icon.up /> : <Icon.down />}</button>}
      {showOut && <div class="list">{out.map((p) => <Row trip={trip} p={p} />)}</div>}
      <button class="link press" style={{ alignSelf: 'center' }} onClick={() => open({ kind: 'sheet', name: 'review' })}>Anything missing? Check my list</button>
      <PlanBar trip={trip} />
    </>
  )
}

/** After the vibe, budget, group, pace or food changed: the list is being (or needs to be) re-scored. */
function RefreshBanner({ trip }: { trip: Trip }) {
  const r = refreshing.use()[trip.id]
  if (r === 'busy') return <div class="banner"><Spinner /><span class="grow small">Updating ideas for your new settings… (about 30 s)</span></div>
  if (!stale(trip)) return null
  return (
    <div class="banner">
      <span class="dot red" />
      <span class="grow small">{r ? `Couldn't update: ${r}` : 'Trip settings changed: ideas are out of date.'}</span>
      <button class="btn btn-primary btn-sm press" onClick={() => void refreshList(trip.id)}>Update</button>
    </div>
  )
}

/** Places that didn't fit the last time "Plan my days" ran (so nothing nags about them). */
export const unfitIds = createStore<string[]>([])

/** Fits what you want into the days still ahead (and takes off what you no longer want). */
export function fitWanted(trip: Trip) {
  const now = nowIn(trip)
  const fromDay = now.day >= 1 ? now.day + 1 : 1
  const r = planChecked(trip, tripPlaces(trip.id), days.get(), fromDay)
  unfitIds.set(r.unfit.map((p) => p.id))
  const parts = [r.added && `${r.added} added`, r.removed && `${r.removed} removed`, r.unfit.length && `${r.unfit.length} didn't fit`].filter(Boolean)
  save('place', r.places, `Days planned${parts.length ? ` · ${parts.join(' · ')}` : ''}`)
}

/** What "Plan my days" would do now (nothing to show when the wants and the days agree). */
export function pendingFor(trip: Trip) {
  const now = nowIn(trip)
  const fromDay = now.day >= 1 ? now.day + 1 : 1
  if (fromDay > tripDays(trip)) return null
  const { add, remove } = planPending(tripPlaces(trip.id), fromDay)
  const unfit = unfitIds.get()
  const fresh = add.filter((p) => !unfit.includes(p.id))
  return { add: fresh, remove, stuck: add.filter((p) => unfit.includes(p.id)), started: now.day >= 1 }
}

/** Sticky at the bottom whenever what you want and the days disagree. */
function PlanBar({ trip }: { trip: Trip }) {
  unfitIds.use()
  const pend = pendingFor(trip)
  if (!pend) return null
  if (!pend.add.length && !pend.remove.length) {
    return pend.stuck.length ? <p class="muted small tcenter">{pend.stuck.length} wanted {pend.stuck.length === 1 ? "doesn't" : "don't"} fit the days: {pend.stuck.map((p) => p.name).join(', ')}.</p> : null
  }
  const what = [pend.add.length && `${pend.add.length} to add`, pend.remove.length && `${pend.remove.length} to remove`].filter(Boolean).join(' · ')
  return (
    <div class="planbar">
      <button class="btn btn-primary grow press" onClick={() => fitWanted(trip)}><Icon.plan />Plan my days</button>
      <span class="small">{what}{pend.started ? ' · from tomorrow' : ''}</span>
    </div>
  )
}

/** The checkbox: checked = want it. ↺ on a skipped place brings it back. Swipe ← skips, → wants. */
export function Tick({ p }: { p: Place }) {
  const on = p.status === 'picked'
  const act = () => setStatus(p.id, on ? 'maybe' : p.status === 'out' ? 'maybe' : 'picked')
  if (p.status === 'out') return <button class="tick out press" aria-label={`Bring back ${p.name}`} onClick={act}><span><Icon.refresh /></span></button>
  return <button class={`tick press${on ? ' on' : ''}`} role="checkbox" aria-checked={on} aria-label={p.name} onClick={act}><span>{on ? <Icon.check /> : null}</span></button>
}

function Row({ trip, p }: { trip: Trip; p: Place }) {
  const left = p.status === 'out' ? undefined : () => (p.must ? pushDown(p.id) : setStatus(p.id, 'out'))
  const right = p.status === 'picked' ? undefined : () => setStatus(p.id, p.status === 'out' ? 'maybe' : 'picked')
  const sw = swipeable(left, right)
  const pt = here.get().pt
  const t = !p.booked && pt ? travelFrom(trip, p, pt) : null
  const unfit = p.status === 'picked' && p.day == null && unfitIds.get().includes(p.id)
  const g = groupOf(p)
  return (
    <div class={`prow${p.done ? ' done' : ''}`} data-left={p.must ? 'To the bottom' : 'Skip'} data-right={p.status === 'out' ? 'Bring back' : 'Want'} {...sw}>
      <Tick p={p} />
      <button class="open press" onClick={() => open({ kind: 'card', place: p.id })}>
        <span class="line1">{p.must && <span class="star" aria-label="Must-see">★</span>}<span class="name">{p.name}</span>{p.day ? <span class="when">{p.done ? 'Done' : `Day ${p.day}`}</span> : unfit ? <span class="when warn-text">No room</span> : null}</span>
        <span class="meta"><span class="dot" style={{ background: GROUP_COLOR[g] }} />{p.fresh && <span class="chip ok">New</span>}{p.badge === 'trap' && <span class="chip trap">Trap</span>}{p.scoring ? 'Scoring…' : p.own ? `Your plan${t ? ` · ${t.real ? '' : '≈'}${legText(t)}` : ''}` : `${p.worth}/10 · ${short(trip, p.price)}${t ? ` · ${t.real ? '' : '≈'}${legText(t)}` : ''}`}</span>
      </button>
    </div>
  )
}

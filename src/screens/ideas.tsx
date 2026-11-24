// Ideas: everything worth doing on this trip, to choose from. One job: decide what you want.
// Search, Filters (the same as the map's), the list (or the same places on a map). Check = want it;
// "Fit them in" puts what you want on the days.
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
import { applyFilter, DEFAULT_FILTER, FilterPanel, ideaFilter, isCustom } from './filterpanel'
import { TripBar } from './tripbar'
import type { Place, Trip } from '../lib/model'

/** Which chip is on (all, must-sees, or one type) and the search text. Kept while the app is open. */
const view = createStore<{ q: string }>({ q: '' })

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
  const f = ideaFilter.use()
  const v = view.use()
  here.use(); unfitIds.use()
  // Times on each row are from where you are now.
  useEffect(() => { void locate() }, [])
  const [showOut, setShowOut] = useState(false)
  const [panel, setPanel] = useState(false)
  const all = tripPlaces(trip.id).filter((p) => !(p.booked && p.kind === 'other'))
  const q = words(v.q.trim())
  const match = (p: Place) => !q || words(p.name).includes(q)
  const list = applyFilter(all, f, trip).filter(match)
  const out = all.filter((p) => p.status === 'out' && match(p))
  const custom = isCustom(f)
  const wanted = all.filter((p) => p.status === 'picked').length
  const toDecide = queueFor(trip, settings.get().me).length
  const cap = capacity(trip, all)
  const pend = pendingFor(trip)

  return (
    <>
      <RefreshBanner trip={trip} />
      <div class="searchrow">
        <span class="search"><Icon.search /><input type="search" placeholder="Search your ideas" aria-label="Search your ideas" value={v.q} onInput={(e) => view.set({ ...v, q: (e.target as HTMLInputElement).value })} /></span>
        <button class="pill press" onClick={() => open({ kind: 'sheet', name: 'discover', arg: v.q.trim() || undefined })}><Icon.plus />Find more</button>
      </div>
      {panel ? <FilterPanel trip={trip} all={all} shown={list.length} sort done={{ label: 'Show {n}', onClick: () => setPanel(false) }} /> : (
        <button class="banner press" aria-label="Filters" onClick={() => setPanel(true)}>
          <Icon.filter /><span class="grow small"><b>{list.length} shown</b>{custom ? ' · filtered' : ''}</span><span class="strong small">Filters</span><Icon.down />
        </button>
      )}

      {toDecide > 0 && !q && !panel && (
        <button class="decide-cta press" onClick={() => open({ kind: 'sheet', name: 'decide' })}>
          <span class="grow stack" style={{ gap: '2px', textAlign: 'left' }}><b>Help me choose</b><span class="muted small">{toDecide} to look at, one at a time</span></span>
          <Icon.chev />
        </button>
      )}

      <div class="listhead">
        <span class="grow stack" style={{ gap: '1px' }}>
          <b>{wanted} wanted</b>
          <span class={`small ${cap.left < -60 ? 'warn-text' : 'muted'}`}>{capacityText(cap)}</span>
          {/* Wanted but not on a day yet: one quiet line (Days says it too), not a floating bar. */}
          {pend && pend.add.length > 0 && <span class="small">{pend.add.length} not on a day yet · <button class="link small press" onClick={() => fitWanted(trip)}>Fit them in</button></span>}
        </span>
        <button class="iconbtn ring press" aria-label="New activity" onClick={() => open({ kind: 'sheet', name: 'add', arg: trip.id })}><Icon.plus /></button>
      </div>
      {list.length > 0 ? <div class="list">{list.map((p) => <Row trip={trip} p={p} />)}</div> : (
        <div class="empty">
          <p>{q ? `Nothing called "${v.q.trim()}" yet.` : custom ? 'Nothing matches the filters.' : 'Nothing here yet.'}</p>
          {custom && !q ? <button class="btn btn-secondary press" onClick={() => ideaFilter.set({ ...DEFAULT_FILTER, sort: f.sort })}>Reset filters</button>
            : <button class="btn btn-primary press" onClick={() => open({ kind: 'sheet', name: 'discover', arg: v.q.trim() || undefined })}><Icon.search />{q ? `Search Google for "${v.q.trim()}"` : 'Find more'}</button>}
        </div>
      )}

      {out.length > 0 && <button class="fold press" aria-expanded={showOut} onClick={() => setShowOut(!showOut)}>Skipped ({out.length}){showOut ? <Icon.up /> : <Icon.down />}</button>}
      {showOut && <div class="list">{out.map((p) => <Row trip={trip} p={p} />)}</div>}
      <button class="link press" style={{ alignSelf: 'center' }} onClick={() => open({ kind: 'sheet', name: 'review' })}>Anything missing? Check my list</button>
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

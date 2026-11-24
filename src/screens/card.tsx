// The Activity Card: every list row, alert, day slot and chat mention opens this same dialog.
// It's the one place for anything about a single place: star, day, time there, done.
import { useEffect, useState } from 'preact/hooks'
import { BadgeFull, Dialog, Icon, Stepper } from '../ui'
import { nowIn, places, plansFor, save, settings } from '../lib/data'
import { fillAbout } from '../lib/about'
import { locateAll } from '../lib/locate'
import { hasKids, weights } from '../lib/score'
import { close, open, replaceTop } from '../lib/nav'
import { setDone, setMinutes, setMust, setStatus, setTime } from '../lib/actions'
import { dateOf, hoursOn } from '../lib/planner'
import { clock, duration, pad } from '../lib/time'
import { home, short } from '../lib/money'
import type { Place, Trip } from '../lib/model'
import { groupOf } from '../lib/groups'
import { GROUP_COLOR, GROUP_NAME } from '../lib/groupStyle'
import { legText, type Mode } from '../lib/geo'
import { travelFrom, routeHere, useHereTimes } from '../lib/routes'
import { here, locate } from '../lib/here'
import { connected } from '../lib/sync'
import { photoFor } from '../lib/background'

/** Google Maps photos, as a square tile where a photo would be (or after the photos). */
function MapsTile({ href }: { href: string }) {
  return <a class="mapstile press" href={href} target="_blank" rel="noopener"><Icon.photo /><span>Photos on Google Maps</span><Icon.out /></a>
}

export function Photos({ p, size = 'big', maps }: { p: Place; size?: 'big' | 'thumb'; maps?: string }) {
  const urls = p.photos?.urls ?? []
  if (!urls.length) return null
  if (size === 'thumb') return <img class="thumb" src={urls[0]} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onLoad={(e) => (e.currentTarget as HTMLImageElement).classList.add('in')} />
  return (
    <div class={`photos${urls.length === 1 ? ' one' : ''}`}>
      {urls.map((u) => <img src={u} alt={`${p.name}`} loading="lazy" decoding="async" referrerpolicy="no-referrer" onLoad={(e) => (e.currentTarget as HTMLImageElement).classList.add('in')} />)}
      {maps && <MapsTile href={maps} />}
    </div>
  )
}

/** Travel from where you are: Google Maps times once fetched, the app's estimate until then. */
function useTravel(trip: Trip, p: Place) {
  const loc = here.use()
  useHereTimes()
  useEffect(() => { void locate() }, [])
  const f = loc.pt ? travelFrom(trip, p, loc.pt) : null
  useEffect(() => { if (loc.pt && f && !f.real) void routeHere(trip, p, loc.pt).catch(() => { /* later */ }) }, [p.id, loc.pt?.lat, loc.pt?.lng])
  return { f, loc }
}
const MODE_ICON = { walk: Icon.walk, transit: Icon.train, car: Icon.car }
const directions = (trip: Trip, p: Place, mode?: Mode) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.name}, ${trip.dest.name}`)}${mode ? `&travelmode=${mode === 'car' ? 'driving' : mode === 'transit' ? 'transit' : 'walking'}` : ''}`

/** All three ways from here, ours highlighted. */
function TravelPanel({ trip, p, f }: { trip: Trip; p: Place; f: NonNullable<ReturnType<typeof useTravel>['f']> }) {
  const ap = f.real ? '' : '≈'
  return (
    <div class="fold-panel">
      <div class="modes">{(['walk', 'transit', 'car'] as Mode[]).filter((m) => f.times[m] != null).map((m) => { const M = MODE_ICON[m]; return <span class={`mode${m === f.mode ? ' on' : ''}`}><M />{ap}{f.times[m]} min</span> })}</div>
      <div class="between"><span class="muted small">{f.km < 10 ? f.km.toFixed(1) : Math.round(f.km)} km · {f.real ? 'Google Maps, traffic now' : connected() ? 'estimate, checking Google Maps…' : 'estimate'}</span><a class="link small press" href={directions(trip, p, f.mode)} target="_blank" rel="noopener">Directions<Icon.out /></a></div>
    </div>
  )
}

/** Why it scores what it does: the bars and their weights. */
function WhyPanel({ trip, p }: { trip: Trip; p: Place }) {
  const w = weights(hasKids(trip))
  const val = (k: string) => (k === 'Value' ? p.value : k === 'Iconic' ? p.sub.iconic : k === 'Vibe fit' ? p.sub.vibe : k === 'Kid fit' ? p.sub.kid : p.sub.hassle)
  return (
    <div class="fold-panel">
      {w.map(([k, wt]) => <div class="score"><span>{k} <span class="muted small">{Math.round(wt * 100)}%</span></span><div class="bar"><span style={{ width: `${val(k) * 10}%` }} /></div><b class="num">{val(k)}</b></div>)}
      {p.why && <p class="small">{p.why}</p>}
    </div>
  )
}

/** ✓ Great for … / ✕ Skip if … (for deciding). */
export function GoodSkip({ p }: { p: Place }) {
  return (
    <div class="goodskip">
      {p.good && <p><b class="ok-text">✓ Great for</b> {p.good}</p>}
      {p.skipIf && <p><b class="warn-text">✕ Skip if</b> {p.skipIf}</p>}
    </div>
  )
}

const VOTE = { picked: 'wants it', maybe: 'says maybe', out: 'would skip it' }
/** What the others said in Decide ("Marie wants it"). */
export function Votes({ p }: { p: Place }) {
  const me = settings.get().me
  const others = Object.entries(p.votes ?? {}).filter(([who]) => who !== me)
  if (!others.length) return null
  return <p class="small">{others.map(([who, v]) => `${who} ${VOTE[v]}`).join(' · ')}</p>
}

/** Where it is, and whether that was checked on a map (Gemini's own coordinates can be off). */
function Where({ p }: { p: Place }) {
  const l = p.loc
  if (l?.src === 'google' || l?.src === 'osm') return <span class="muted small trunc" style={{ maxWidth: '100%' }}>📍 {(l.address ?? 'On the map').split(',').slice(0, 2).join(',')}{l.exact === false ? ' (area)' : ''}</span>
  return <span class="small warn-text">{l?.src === 'none' ? '📍 Not found on Google Maps: may be off' : '📍 Checking where it is…'}</span>
}

const tried = new Set<string>()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** 24-hour time as two pickers (hour, then quarter hours): phones' own time boxes may show AM/PM. */
export function Clock24({ label, value, custom, onChange }: { label: string; value: number; custom: boolean; onChange: (v: number) => void }) {
  const h = Math.floor(value / 60) % 24, m = value % 60
  // Quarter hours (plus the planner's own time, if it's in between).
  const mins = [...new Set([0, 15, 30, 45, m])].sort((a, b) => a - b)
  return (
    <span class={`clock24${custom ? ' custom' : ''}`} role="group" aria-label={label}>
      <select aria-label="Hour" value={h} onChange={(e) => onChange(Number((e.target as HTMLSelectElement).value) * 60 + m)}>{Array.from({ length: 24 }, (_, i) => <option value={i}>{pad(i)}</option>)}</select>
      <b>:</b>
      <select aria-label="Minutes" value={m} onChange={(e) => onChange(h * 60 + Number((e.target as HTMLSelectElement).value))}>{mins.map((x) => <option value={x}>{pad(x)}</option>)}</select>
    </span>
  )
}
const REC = { pay: '', cheaper: 'Save money:', skip: 'Honestly, skip it:' }

export function Card({ trip, id }: { trip: Trip; id: string }) {
  const p = places.use()[id]
  const [open2, setOpen] = useState<'why' | 'travel' | null>(null)
  const toggle = (k: 'why' | 'travel') => setOpen(open2 === k ? null : k)
  // Photos are looked up in the background; if this one hasn't been yet, do it now (never blocks).
  useEffect(() => { if (p && !p.photos && !tried.has(id)) { tried.add(id); void photoFor(p, trip) } }, [id])
  // "New" (from a refresh) goes away once you've looked.
  useEffect(() => { if (p?.fresh) { const { fresh: _, ...rest } = p; save('place', [rest]) } }, [id])
  // A description for your group (and Great for / Skip if) the first time the card opens.
  useEffect(() => { if (p) { void fillAbout(trip, [p]); void locateAll(trip, [p]).catch(() => {}) } }, [id])
  const { f, loc } = useTravel(trip, p ?? ({} as Place))
  if (!p) return null
  const now = nowIn(trip)
  const day = p.day ?? null
  const date = day ? dateOf(trip, day) : now.day >= 1 ? now.date : trip.start
  const h = hoursOn(p, date)
  const slot = day ? plansFor(trip)[day - 1]?.slots.find((s) => s.id === p.id) : undefined
  const group = p.price * Math.max(1, trip.people.length)
  // Flights and other bookings that aren't activities: no score, price, photos or opening hours.
  const ticket = !!p.booked && p.kind === 'other'
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${trip.dest.name}`)}`
  const g = groupOf(p)
  const M = f ? MODE_ICON[f.mode] : null
  return (
    <Dialog label={p.name}>
      {!ticket && <Photos p={p} maps={maps} />}
      {/* The name first; must-see is a star next to Close, like a favourite. */}
      <div class="cardhead">
        <div class="grow stack" style={{ gap: '4px', minWidth: 0 }}>
          <h2 class="h2">{p.name}</h2>
          {ticket ? <p class="muted">{p.booked}{p.why ? ` · ${p.why}` : ''}</p> : (
            <div class="row" style={{ flexWrap: 'wrap', gap: '6px' }}>
              {p.must && <span class="chip star"><Icon.star />Must-see</span>}
              <span class="muted small"><span class="dot" style={{ background: GROUP_COLOR[g] }} /> {p.own ? 'Your plan' : GROUP_NAME[g]}</span>
              {p.badge !== 'worth' && <BadgeFull p={p} />}
              {p.done && <span class="chip plain">Done</span>}
              <Where p={p} />
            </div>
          )}
        </div>
        {!ticket && <button class={`iconbtn ring press starbtn${p.must ? ' on' : ''}`} aria-label={p.must ? 'Must-see' : 'Make must-see'} aria-pressed={p.must} onClick={() => setMust(p.id, !p.must)}>{p.must ? <Icon.star /> : <Icon.starOff />}</button>}
        <button class="iconbtn ring press" aria-label="Close" onClick={close}><Icon.x /></button>
      </div>

      {!ticket && (p.scoring ? <p class="muted">Scoring… a few seconds.</p> : <>
        <div class={`facts3${p.own ? ' own' : ''}`}>
          {!p.own && <button class={`fact press${open2 === 'why' ? ' on' : ''}`} aria-expanded={open2 === 'why'} onClick={() => toggle('why')}>
            <b class="num">{p.worth}<small>/10</small></b><span class="muted small">Why? {open2 === 'why' ? <Icon.up /> : <Icon.down />}</span>
          </button>}
          {!p.own && <div class="fact"><b class="num">{p.price ? <>{short(trip, p.price)}<small> pp</small></> : 'Free'}</b><span class="muted small">{p.price ? `${home(trip, group)} for ${trip.people.length}` : 'for everyone'}</span></div>}
          <button class={`fact press${open2 === 'travel' ? ' on' : ''}`} aria-expanded={open2 === 'travel'} disabled={!f} onClick={() => toggle('travel')}>
            {f && M ? <><b class="num"><M />{f.real ? '' : '≈'}{f.minutes} min</b><span class="muted small">from here {open2 === 'travel' ? <Icon.up /> : <Icon.down />}</span></>
              : <><b class="num">–</b><span class="muted small">{loc.busy || !loc.error ? 'Finding you…' : 'Location off'}</span></>}
          </button>
        </div>
        {open2 === 'why' && <WhyPanel trip={trip} p={p} />}
        {open2 === 'travel' && f && <TravelPanel trip={trip} p={p} f={f} />}
      </>)}

      {/* The decision: one tap, always near the top. Must-sees can't be skipped. */}
      {!ticket && <div class="seg" role="group" aria-label="In the plan">
        {(['picked', 'maybe', 'out'] as const).map((s) => s === 'out' && p.must ? null : (
          <button class={p.status === s ? 'on press' : 'press'} aria-pressed={p.status === s} onClick={() => setStatus(p.id, s)}>{s === 'picked' ? 'Want it' : s === 'maybe' ? 'Maybe' : 'Skip'}</button>
        ))}
      </div>}
      {p.status !== 'out' && (
        <div class="row">
          <button class={`btn ${day || p.status !== 'picked' ? 'btn-secondary' : 'btn-primary'} grow press`} onClick={() => open({ kind: 'sheet', name: 'day', arg: p.id })}>{day ? `Day ${day}` : 'Add to a day'} <Icon.down /></button>
          {day != null && (slot || p.fixed != null) && <Clock24 label={`Start time of ${p.name}`} value={p.fixed ?? slot!.start} custom={p.fixed != null} onChange={(v) => setTime(trip, p.id, v)} />}
          {<button class={`btn btn-sm press donebtn${p.done ? ' on' : ''}`} aria-pressed={!!p.done} onClick={() => setDone(p.id, !p.done)}><Icon.check />Done</button>}
        </div>
      )}
      {/* Closed, near closing, too early, or late: right under the day and time you picked. */}
      {p.status !== 'out' && slot?.warn && <p class="small warn-text cardwarn" role="alert">⚠ {slot.warn}</p>}
      {p.status !== 'out' && day != null && p.fixed != null && (
        <span class="muted small" style={{ marginTop: '-6px' }}>{p.booked ? 'Booked time' : <>Your time · <button class="link small press" onClick={() => setTime(trip, p.id, null)}>let the planner choose</button></>}</span>
      )}

      {/* Advice only when it changes something (cheaper version, skip); plain "pay for it" needs no label. */}
      {!ticket && p.recText && <p>{p.rec !== 'pay' && <b>{REC[p.rec]} </b>}{cap(p.recText.replace(/^(Pay for it|Do the cheaper version|Skip( it)?|Go for it)[:.,;]?\s*/i, ''))}</p>}
      {p.desc ? <p class="desc">{p.desc}</p> : !p.scoring && !ticket && settings.get().geminiKey ? <p class="muted small">Getting a description…</p> : null}
      {(p.good || p.skipIf) && <GoodSkip p={p} />}
      <Votes p={p} />
      {p.tip && <p class="small"><b>Tip:</b> {p.tip}</p>}

      {!ticket && (
        <div class="between small hoursline">
          <span>{h === undefined ? 'Hours not known' : h === null ? <b class="warn-text">Closed {day ? `on Day ${day}` : 'today'}</b> : <>Open <b>{clock(h[0])}–{clock(h[1])}</b> {day ? `on Day ${day}` : 'today'}</>}</span>
          <span class="row" style={{ gap: '12px' }}>
            {h !== undefined ? <button class="link small press" onClick={() => { const { hours: _, ...rest } = p; save('place', [rest], 'Hours cleared: the planner won\'t warn about them') }}>Not right?</button> : null}
            <a class="link small press" href={maps} target="_blank" rel="noopener">Check<Icon.out /></a>
          </span>
        </div>
      )}
      <Stepper label="Time there" hint={`(suggested ${duration(p.suggested)})`} value={p.minutes} show={duration} step={15} min={15} max={600} custom={p.minutes !== p.suggested} onChange={(v) => setMinutes(p.id, v)} />

      <div class="linksrow">
        {!ticket && <a class="btn btn-quiet btn-sm press" href={maps} target="_blank" rel="noopener"><Icon.photo />Photos</a>}
        <a class="btn btn-quiet btn-sm press" href={directions(trip, p, f?.mode)} target="_blank" rel="noopener"><Icon.pin />Directions</a>
        <button class="btn btn-quiet btn-sm press" onClick={() => replaceTop({ kind: 'ask', place: p.id })}><Icon.chat />Ask</button>
      </div>
      {p.photos?.urls.length ? <span class="muted small">Photo{p.photos.urls.length > 1 ? 's' : ''}: <a href={`https://${p.photos.lang}.wikipedia.org/wiki/${encodeURIComponent(p.photos.title.replace(/ /g, '_'))}`} target="_blank" rel="noopener">Wikipedia</a></span> : null}
    </Dialog>
  )
}

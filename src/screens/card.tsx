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
import { price } from '../lib/money'
import type { Place, Trip } from '../lib/model'
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
  if (!urls.length) return maps && size === 'big' ? <div class="photos"><MapsTile href={maps} /></div> : null
  if (size === 'thumb') return <img class="thumb" src={urls[0]} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onLoad={(e) => (e.currentTarget as HTMLImageElement).classList.add('in')} />
  return (
    <div class={`photos${urls.length === 1 ? ' one' : ''}`}>
      {urls.map((u) => <img src={u} alt={`${p.name}`} loading="lazy" decoding="async" referrerpolicy="no-referrer" onLoad={(e) => (e.currentTarget as HTMLImageElement).classList.add('in')} />)}
      {maps && <MapsTile href={maps} />}
    </div>
  )
}

/** From where you are now: all three ways, ours in bold, and Directions. */
function FromHere({ trip, p }: { trip: Trip; p: Place }) {
  const loc = here.use()
  useHereTimes()
  useEffect(() => { void locate() }, [])
  const f = loc.pt ? travelFrom(trip, p, loc.pt) : null
  // Real Google Maps times for this place from here (estimate until they arrive).
  useEffect(() => { if (loc.pt && f && !f.real) void routeHere(trip, p, loc.pt).catch(() => { /* later */ }) }, [p.id, loc.pt?.lat, loc.pt?.lng])
  const I = { walk: Icon.walk, transit: Icon.train, car: Icon.car }
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.name}, ${trip.dest.name}`)}&travelmode=${f?.mode === 'car' ? 'driving' : f?.mode === 'transit' ? 'transit' : 'walking'}`
  const ap = f?.real ? '' : '≈'
  return (
    <div class="fromhotel">
      {!f ? (
        <div class="between"><span class="small muted">{loc.busy || !loc.error ? 'Finding you…' : loc.error}</span>{loc.error && !loc.busy && <button class="link small press" onClick={() => void locate(true)}>Try again</button>}</div>
      ) : <>
        <div class="between"><span class="small"><b>{ap}{legText(f)}</b> from here · {f.km < 10 ? f.km.toFixed(1) : Math.round(f.km)} km</span><a class="link small press" href={dir} target="_blank" rel="noopener">Directions<Icon.out /></a></div>
        <div class="modes">{(['walk', 'transit', 'car'] as Mode[]).filter((m) => f.times[m] != null).map((m) => { const M = I[m]; return <span class={`mode${m === f.mode ? ' on' : ''}`}><M />{ap}{f.times[m]} min</span> })}</div>
        <span class="muted small">{f.real ? 'Google Maps times, with traffic now' : connected() ? 'Estimate: getting Google Maps times…' : 'Estimate: Google Maps times need the family script (⚙)'}</span>
      </>}
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
  if (l?.src === 'google' || l?.src === 'osm') return <p class="muted small" style={{ marginTop: '-6px' }}>📍 {l.address ?? 'On the map'}{l.exact === false ? ' (area only)' : ''}</p>
  return <p class="small warn-text" style={{ marginTop: '-6px' }}>{l?.src === 'none' ? 'Not found on Google Maps: its spot on the map may be off' : 'Checking where it is…'}</p>
}

const tried = new Set<string>()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** 24-hour time as two pickers (hour, then minutes in 5s): phones' own time boxes may show AM/PM. */
function Clock24({ label, value, custom, onChange }: { label: string; value: number; custom: boolean; onChange: (v: number) => void }) {
  const h = Math.floor(value / 60) % 24, m = value % 60
  const mins = [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), m])].sort((a, b) => a - b)
  return (
    <span class={`clock24${custom ? ' custom' : ''}`} role="group" aria-label={label}>
      <select aria-label="Hour" value={h} onChange={(e) => onChange(Number((e.target as HTMLSelectElement).value) * 60 + m)}>{Array.from({ length: 24 }, (_, i) => <option value={i}>{pad(i)}</option>)}</select>
      <b>:</b>
      <select aria-label="Minutes" value={m} onChange={(e) => onChange(h * 60 + Number((e.target as HTMLSelectElement).value))}>{mins.map((x) => <option value={x}>{pad(x)}</option>)}</select>
    </span>
  )
}
const REC = { pay: 'Pay for it', cheaper: 'Do the cheaper version', skip: 'Skip it' }

export function Card({ trip, id }: { trip: Trip; id: string }) {
  const p = places.use()[id]
  const [why, setWhy] = useState(false)
  // Photos are looked up in the background; if this one hasn't been yet, do it now (never blocks).
  useEffect(() => { if (p && !p.photos && !tried.has(id)) { tried.add(id); void photoFor(p, trip) } }, [id])
  // "New" (from a refresh) goes away once you've looked.
  useEffect(() => { if (p?.fresh) { const { fresh: _, ...rest } = p; save('place', [rest]) } }, [id])
  // A description for your group (and Great for / Skip if) the first time the card opens.
  useEffect(() => { if (p) { void fillAbout(trip, [p]); void locateAll(trip, [p]).catch(() => {}) } }, [id])
  if (!p) return null
  const now = nowIn(trip)
  const day = p.day ?? null
  const date = day ? dateOf(trip, day) : now.day >= 1 ? now.date : trip.start
  const h = hoursOn(p, date)
  const slot = day ? plansFor(trip)[day - 1]?.slots.find((s) => s.id === p.id) : undefined
  const group = p.price * Math.max(1, trip.people.length)
  const checked = p.hours?.source === 'google' && p.hours.checkedAt ? new Date(p.hours.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }) : null
  // Flights and other bookings that aren't activities: no score, price, photos or opening hours.
  const ticket = !!p.booked && p.kind === 'other'
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${trip.dest.name}`)}`
  return (
    <Dialog label={p.name}>
      <div class="between">
        <button class={`pill press${p.must ? ' on' : ''}`} aria-pressed={p.must} onClick={() => setMust(p.id, !p.must)} style={p.must ? { background: 'var(--star-bg)', color: 'var(--star)', borderColor: 'var(--star-bg)' } : undefined}>
          {p.must ? <Icon.star /> : <Icon.starOff />}{p.must ? 'Must-see' : 'Make must-see'}
        </button>
        <div class="row"><BadgeFull p={p} /><button class="iconbtn ring press" aria-label="Close" onClick={close}><Icon.x /></button></div>
      </div>
      {!ticket && <Photos p={p} maps={maps} />}
      <h2 class="h2">{p.name}</h2>
      {!ticket && <Where p={p} />}
      {ticket && <p class="muted">{p.booked}{p.why ? ` · ${p.why}` : ''}</p>}

      {ticket ? null : p.scoring ? <p class="muted">Scoring… a few seconds.</p> : (
        <div class="between" style={{ alignItems: 'flex-start' }}>
          <div class="stat"><span class="muted small">Worth it</span><span class="big num">{p.worth}<small>/10</small></span></div>
          <div class="stat" style={{ textAlign: 'right' }}><span class="muted small">Price</span><span class="big num" style={{ fontSize: '20px' }}>{price(trip, p.price)}</span>{p.price > 0 && <span class="muted small">{price(trip, group, false)} for {trip.people.length}</span>}</div>
        </div>
      )}
      {!ticket && p.recText && <p><b>{p.rec === 'pay' && p.price === 0 ? 'Go for it' : REC[p.rec]}.</b> {cap(p.recText.replace(/^(Pay for it|Do the cheaper version|Skip( it)?)[:.,;]?\s*/i, ''))}</p>}
      {p.desc ? <p class="desc">{p.desc}</p> : !p.scoring && !p.booked && settings.get().geminiKey ? <p class="muted small">Getting a description…</p> : null}
      {(p.good || p.skipIf) && <GoodSkip p={p} />}
      <Votes p={p} />

      {!ticket && <FromHere trip={trip} p={p} />}

      {/* Where it stands: one tap, always visible. Must-sees can't be skipped. */}
      {!ticket && <div class="seg" role="group" aria-label="In the plan">
        {(['picked', 'maybe', 'out'] as const).map((s) => s === 'out' && p.must ? null : (
          <button class={p.status === s ? 'on press' : 'press'} aria-pressed={p.status === s} onClick={() => setStatus(p.id, s)}>{s === 'picked' ? 'Want it' : s === 'maybe' ? 'Maybe' : 'Skip'}</button>
        ))}
      </div>}
      {p.status !== 'out' && (
        <div class="row">
          <button class="btn btn-primary grow press" onClick={() => open({ kind: 'sheet', name: 'day', arg: p.id })}>{day ? `Day ${day}` : 'Add to a day'} <Icon.down /></button>
          {day != null && <button class={`btn btn-sm press ${p.done ? 'btn-primary' : 'btn-quiet'}`} aria-pressed={!!p.done} onClick={() => setDone(p.id, !p.done)}><Icon.check />Done</button>}
        </div>
      )}
      {p.status !== 'out' && day != null && (slot || p.fixed != null) && (
        <div class="timerow">
          <span class="grow"><span class="strong">Start time</span><br /><span class="muted small">{p.fixed != null ? (p.booked ? 'Booked time' : 'Set by you') : 'Set by the planner'}</span></span>
          <Clock24 label={`Start time of ${p.name}`} value={p.fixed ?? slot!.start} custom={p.fixed != null} onChange={(v) => setTime(trip, p.id, v)} />
          {p.fixed != null && !p.booked && <button class="btn btn-quiet btn-sm press" onClick={() => setTime(trip, p.id, null)}>Auto</button>}
        </div>
      )}

      {!ticket && <div class="banner" style={{ padding: '6px 6px 6px 14px' }}>
        <span class="grow small">{h === undefined ? 'Hours not known yet' : h === null ? <b style={{ color: 'var(--red)' }}>Closed {day ? `on Day ${day}` : 'today'}</b> : <><b>Open {clock(h[0])}–{clock(h[1])}</b>{day ? ` on Day ${day}` : ' today'}</>}
          <br /><span class="muted">{checked ? `Checked with Google · ${checked}` : 'Checked with Google each morning'}</span></span>
        <a class="btn btn-quiet btn-sm press" href={maps} target="_blank" rel="noopener">Check hours<Icon.out /></a>
      </div>}

      <Stepper label="Time there" hint={`(suggested ${duration(p.suggested)})`} value={p.minutes} show={duration} step={15} min={15} max={600} custom={p.minutes !== p.suggested} onChange={(v) => setMinutes(p.id, v)} />

      <button class="btn btn-quiet press" onClick={() => replaceTop({ kind: 'ask', place: p.id })}><Icon.chat />Ask about this</button>

      {p.photos?.urls.length ? <span class="muted small">Photo{p.photos.urls.length > 1 ? 's' : ''}: <a href={`https://${p.photos.lang}.wikipedia.org/wiki/${encodeURIComponent(p.photos.title.replace(/ /g, '_'))}`} target="_blank" rel="noopener">Wikipedia</a></span> : null}
      {!p.scoring && !ticket && (
        <button class="link press" aria-expanded={why} onClick={() => setWhy(!why)}>Why {p.worth}?{why ? <Icon.up /> : <Icon.down />}</button>
      )}
      {why && (
        <div class="stack">
          <p class="muted small">{p.worth} = {weights(hasKids(trip)).map(([k, w]) => `${k} ${Math.round(w * 100)}%`).join(' + ')}</p>
          {weights(hasKids(trip)).map(([k]) => { const v = k === 'Value' ? p.value : k === 'Iconic' ? p.sub.iconic : k === 'Vibe fit' ? p.sub.vibe : k === 'Kid fit' ? p.sub.kid : p.sub.hassle; return (
            <div class="score"><span>{k}</span><div class="bar"><span style={{ width: `${v * 10}%` }} /></div><b class="num">{v}</b></div>
          ) })}
          {p.why && <p><b>Why:</b> {p.why}</p>}
          {p.tip && <p><b>Tip:</b> {p.tip}</p>}
        </div>
      )}
    </Dialog>
  )
}

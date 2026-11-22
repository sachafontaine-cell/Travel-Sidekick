// The Activity Card: every list row, alert, day slot and chat mention opens this same dialog.
// It's the one place for anything about a single place: star, day, time there, done.
import { useEffect, useState } from 'preact/hooks'
import { BadgeFull, Dialog, Icon, Stepper } from '../ui'
import { nowIn, places, plansFor, save, settings } from '../lib/data'
import { describePlace, groupKey } from '../lib/ai'
import { hasKids, weights } from '../lib/score'
import { close, open, replaceTop } from '../lib/nav'
import { setDone, setMinutes, setMust, setStatus, setTime } from '../lib/actions'
import { dateOf, hoursOn } from '../lib/planner'
import { clock, duration, pad, parseClock } from '../lib/time'
import { price } from '../lib/money'
import type { Place, Trip } from '../lib/model'
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

const tried = new Set<string>()
const described = new Set<string>()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`
const REC = { pay: 'Pay for it', cheaper: 'Do the cheaper version', skip: 'Skip it' }

export function Card({ trip, id }: { trip: Trip; id: string }) {
  const p = places.use()[id]
  const [why, setWhy] = useState(false)
  // Photos are looked up in the background; if this one hasn't been yet, do it now (never blocks).
  useEffect(() => { if (p && !p.photos && !tried.has(id)) { tried.add(id); void photoFor(p, trip) } }, [id])
  // "New" (from a refresh) goes away once you've looked.
  useEffect(() => { if (p?.fresh) { const { fresh: _, ...rest } = p; save('place', [rest]) } }, [id])
  // Places saved before descriptions existed get one the first time their card opens.
  useEffect(() => {
    if (!p || (p.desc && p.descFor === groupKey(trip)) || p.scoring || p.booked || described.has(id) || !settings.get().geminiKey) return
    described.add(id)
    describePlace(trip, p).then((d) => { const cur = places.get()[id]; if (d && cur) save('place', [{ ...cur, desc: d, descFor: groupKey(trip) }]) }).catch(() => { /* offline: next time */ })
  }, [id])
  if (!p) return null
  const now = nowIn(trip)
  const day = p.day ?? null
  const date = day ? dateOf(trip, day) : now.day >= 1 ? now.date : trip.start
  const h = hoursOn(p, date)
  const slot = day ? plansFor(trip)[day - 1]?.slots.find((s) => s.id === p.id) : undefined
  const group = p.price * Math.max(1, trip.people.length)
  const checked = p.hours?.source === 'google' && p.hours.checkedAt ? new Date(p.hours.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
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
      {ticket && <p class="muted">{p.booked}{p.why ? ` · ${p.why}` : ''}</p>}

      {ticket ? null : p.scoring ? <p class="muted">Scoring… a few seconds.</p> : (
        <div class="between" style={{ alignItems: 'flex-start' }}>
          <div class="stat"><span class="muted small">Worth it</span><span class="big num">{p.worth}<small>/10</small></span></div>
          <div class="stat" style={{ textAlign: 'right' }}><span class="muted small">Price</span><span class="big num" style={{ fontSize: '20px' }}>{price(trip, p.price)}</span>{p.price > 0 && <span class="muted small">{price(trip, group, false)} for {trip.people.length}</span>}</div>
        </div>
      )}
      {!ticket && p.recText && <p><b>{p.rec === 'pay' && p.price === 0 ? 'Go for it' : REC[p.rec]}.</b> {cap(p.recText.replace(/^(Pay for it|Do the cheaper version|Skip( it)?)[:.,;]?\s*/i, ''))}</p>}
      {p.desc ? <p class="desc">{p.desc}</p> : !p.scoring && !p.booked && settings.get().geminiKey ? <p class="muted small">Getting a description…</p> : null}

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
          <label class="grow" for={`t-${p.id}`}><span class="strong">Start time</span><br /><span class="muted small">{p.fixed != null ? (p.booked ? 'Booked time' : 'Set by you') : 'Set by the planner'}</span></label>
          <input id={`t-${p.id}`} class={`field timefield${p.fixed != null ? ' custom' : ''}`} type="time" step={300} value={hhmm(p.fixed ?? slot!.start)} onChange={(e) => { const v = parseClock((e.target as HTMLInputElement).value); if (v != null) setTime(trip, p.id, v) }} />
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

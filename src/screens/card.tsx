// The Activity Card: every list row, alert, day slot and chat mention opens this same dialog.
// It's the one place for anything about a single place: star, day, time there, done.
import { useEffect, useState } from 'preact/hooks'
import { BadgeFull, Dialog, Icon, Stepper } from '../ui'
import { nowIn, places, plansFor } from '../lib/data'
import { close, open, replaceTop } from '../lib/nav'
import { setMinutes, setMust } from '../lib/actions'
import { dateOf, hoursOn } from '../lib/planner'
import { clock, duration } from '../lib/time'
import { price } from '../lib/money'
import type { Place, Trip } from '../lib/model'
import { photoFor } from '../lib/background'

export function Photos({ p, size = 'big' }: { p: Place; size?: 'big' | 'thumb' }) {
  const urls = p.photos?.urls ?? []
  if (!urls.length) return null
  if (size === 'thumb') return <img class="thumb" src={urls[0]} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onLoad={(e) => (e.currentTarget as HTMLImageElement).classList.add('in')} />
  return (
    <div class={`photos${urls.length === 1 ? ' one' : ''}`}>
      {urls.map((u) => <img src={u} alt={`${p.name}`} loading="lazy" decoding="async" referrerpolicy="no-referrer" onLoad={(e) => (e.currentTarget as HTMLImageElement).classList.add('in')} />)}
    </div>
  )
}

const tried = new Set<string>()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const REC = { pay: 'Pay for it', cheaper: 'Do the cheaper version', skip: 'Skip it' }

export function Card({ trip, id }: { trip: Trip; id: string }) {
  const p = places.use()[id]
  const [why, setWhy] = useState(false)
  // Photos are looked up in the background; if this one hasn't been yet, do it now (never blocks).
  useEffect(() => { if (p && !p.photos && !tried.has(id)) { tried.add(id); void photoFor(p, trip) } }, [id])
  if (!p) return null
  const now = nowIn(trip)
  const day = p.day ?? null
  const date = day ? dateOf(trip, day) : now.day >= 1 ? now.date : trip.start
  const h = hoursOn(p, date)
  const slot = day ? plansFor(trip)[day - 1]?.slots.find((s) => s.id === p.id) : undefined
  const group = p.price * Math.max(1, trip.people.length)
  const checked = p.hours?.source === 'google' && p.hours.checkedAt ? new Date(p.hours.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${trip.dest.name}`)}`
  return (
    <Dialog label={p.name}>
      <div class="between">
        <button class={`pill press${p.must ? ' on' : ''}`} aria-pressed={p.must} onClick={() => setMust(p.id, !p.must)} style={p.must ? { background: 'var(--star-bg)', color: 'var(--star)', borderColor: 'var(--star-bg)' } : undefined}>
          {p.must ? <Icon.star /> : <Icon.starOff />}{p.must ? 'Must-see' : 'Make must-see'}
        </button>
        <div class="row"><BadgeFull p={p} /><button class="iconbtn ring press" aria-label="Close" onClick={close}><Icon.x /></button></div>
      </div>
      <Photos p={p} />
      <h2 class="h2">{p.name}</h2>

      {p.scoring ? <p class="muted">Scoring… a few seconds.</p> : (
        <div class="between" style={{ alignItems: 'flex-start' }}>
          <div class="stat"><span class="muted small">Worth it</span><span class="big num">{p.worth}<small>/10</small></span></div>
          <div class="stat" style={{ textAlign: 'right' }}><span class="muted small">Price</span><span class="big num" style={{ fontSize: '20px' }}>{price(trip, p.price)}</span>{p.price > 0 && <span class="muted small">{price(trip, group, false)} for {trip.people.length}</span>}</div>
        </div>
      )}
      {p.recText && <p><b>{REC[p.rec]}.</b> {cap(p.recText.replace(/^(Pay for it|Do the cheaper version|Skip( it)?)[:.,]?\s*/i, ''))}</p>}

      <div class="banner" style={{ padding: '6px 6px 6px 14px' }}>
        <span class="grow small">{h === undefined ? 'Hours not known yet' : h === null ? <b style={{ color: 'var(--red)' }}>Closed {day ? `on Day ${day}` : 'today'}</b> : <><b>Open {clock(h[0])}–{clock(h[1])}</b>{day ? ` on Day ${day}` : ' today'}</>}
          <br /><span class="muted">{checked ? `Checked with Google · ${checked}` : 'From Gemini; checked with Google the morning before'}</span></span>
        <a class="btn btn-quiet btn-sm press" href={maps} target="_blank" rel="noopener">Check hours<Icon.out /></a>
      </div>

      <Stepper label="Time there" hint={`(suggested ${duration(p.suggested)})`} value={p.minutes} show={duration} step={15} min={15} max={600} custom={p.minutes !== p.suggested} onChange={(v) => setMinutes(p.id, v)} />

      <div class="row">
        <button class="btn btn-primary grow press" onClick={() => open({ kind: 'sheet', name: 'day', arg: p.id })}>{day ? `Day ${day}${slot ? ` · ${clock(slot.start)}` : ''}` : 'Add to a day'} <Icon.down /></button>
        <button class="iconbtn ring press" aria-label="More: done, maybe, eliminate" onClick={() => open({ kind: 'sheet', name: 'menu', arg: p.id })}><Icon.dots /></button>
      </div>
      <button class="btn btn-quiet press" onClick={() => replaceTop({ kind: 'ask', place: p.id })}><Icon.chat />Ask about this</button>

      <a class="link press" href={maps} target="_blank" rel="noopener">Photos on Google Maps<Icon.out /></a>
      {p.photos?.urls.length ? <span class="muted small">Photo{p.photos.urls.length > 1 ? 's' : ''}: <a href={`https://${p.photos.lang}.wikipedia.org/wiki/${encodeURIComponent(p.photos.title.replace(/ /g, '_'))}`} target="_blank" rel="noopener">Wikipedia</a></span> : null}
      {!p.scoring && (
        <button class="link press" aria-expanded={why} onClick={() => setWhy(!why)}>Why {p.worth}?{why ? <Icon.up /> : <Icon.down />}</button>
      )}
      {why && (
        <div class="stack">
          {([['Value', p.value], ['Iconic', p.sub.iconic], ['Vibe fit', p.sub.vibe], ['Low hassle', p.sub.hassle], ['Kid fit', p.sub.kid]] as const).map(([k, v]) => (
            <div class="score"><span>{k}</span><div class="bar"><span style={{ width: `${v * 10}%` }} /></div><b class="num">{v}</b></div>
          ))}
          {p.why && <p><b>Why:</b> {p.why}</p>}
          {p.tip && <p><b>Tip:</b> {p.tip}</p>}
        </div>
      )}
    </Dialog>
  )
}

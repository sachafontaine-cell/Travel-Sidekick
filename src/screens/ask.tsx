// Ask: Gemini that knows the trip, the plan, today, the weather and what you're looking at.
// It can propose a change; Apply uses the same action as the Card's Day button.
import { useRef, useState } from 'preact/hooks'
import { Icon, Sheet, Spinner } from '../ui'
import { nowIn, places, plansFor, settings, tripPlaces } from '../lib/data'
import { open } from '../lib/nav'
import { ask, tripBrief, type AskAction } from '../lib/ai'
import { setDay } from '../lib/actions'
import { mustInfo } from '../lib/musts'
import { weather } from '../lib/weather'
import { clock } from '../lib/time'
import type { Trip } from '../lib/model'

interface Turn { q: string; a: string; err?: boolean; action?: AskAction; applied?: boolean }

function context(trip: Trip, placeId?: string): string {
  const now = nowIn(trip)
  const plans = plansFor(trip)
  const all = tripPlaces(trip.id)
  const p = placeId ? places.get()[placeId] : undefined
  const wx = weather.get()[trip.id]
  const day = (d: number) => plans[d - 1]?.slots.map((s) => `${clock(s.start, true)} ${s.place?.name ?? s.kind}${s.warn ? ` (${s.warn})` : ''}`).join('; ') || 'empty'
  const musts = mustInfo(trip, all, plans, now.day, now.min).map((i) => `${i.place.name}: ${i.line}`).join('; ')
  return [
    tripBrief(trip),
    `Now: day ${now.day} of the trip, ${clock(now.min)} local time.${wx ? ` Weather: ${wx.temp}°F${wx.rainAt != null ? `, rain from ${wx.rainAt}:00` : ''}.` : ''}`,
    `Plan by day: ${plans.map((_, i) => `Day ${i + 1}: ${day(i + 1)}`).join(' | ')}`,
    `Must-sees: ${musts}`,
    `Other places (not on a day): ${all.filter((x) => x.day == null && x.status !== 'out' && !x.must).map((x) => `${x.name} (worth ${x.worth})`).join(', ')}`,
    p ? `Looking at: ${p.name} (worth ${p.worth}, value ${p.value}, ${p.price} ${trip.dest.currency} pp, ${p.minutes} min, ${p.day ? `on day ${p.day}` : 'not on a day'}). ${p.why} ${p.tip}` : '',
  ].filter(Boolean).join('\n')
}

export function Ask({ trip, place }: { trip: Trip; place?: string }) {
  const s = settings.use()
  const p = place ? places.use()[place] : undefined
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const chips = p ? ['Worth it with kids?', 'Cheaper alternative?', 'Best time to go?'] : ['What should we do now?', 'Rainy-day ideas?', 'Is any day too busy?']

  const send = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setQ(''); setBusy(true)
    const i = turns.length
    setTurns((t) => [...t, { q: text, a: '' }])
    const upd = (patch: Partial<Turn>) => setTurns((t) => t.map((x, k) => (k === i ? { ...x, ...patch } : x)))
    try {
      const r = await ask(context(trip, place), text, (visible) => { upd({ a: visible }); end.current?.scrollIntoView({ block: 'end' }) })
      upd({ a: r.text, action: r.action })
    } catch (e) { upd({ a: e instanceof Error ? e.message : 'Something went wrong.', err: true }) } finally { setBusy(false) }
  }
  const apply = (i: number, a: AskAction) => {
    const target = tripPlaces(trip.id).find((x) => x.name.toLowerCase() === a.place.toLowerCase()) ?? tripPlaces(trip.id).find((x) => x.name.toLowerCase().includes(a.place.toLowerCase()))
    if (target) setDay(target.id, a.day)
    setTurns((t) => t.map((x, k) => (k === i ? { ...x, applied: true } : x)))
  }

  return (
    <Sheet title="Ask" foot={
      <div class="composer" style={{ padding: 0, width: '100%' }}>
        <input class="field grow" placeholder={s.geminiKey ? 'Ask about this trip…' : 'Add the Gemini key first'} aria-label="Message" value={q} disabled={!s.geminiKey} onInput={(e) => setQ((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(q) }} />
        <button class="send press" aria-label="Send" disabled={!q.trim() || busy || !s.geminiKey} onClick={() => send(q)}><Icon.send /></button>
      </div>}>
      {p && <span class="chip ok" style={{ alignSelf: 'flex-start' }}>Looking at: {p.name}{p.day ? ` · Day ${p.day}` : ''}</span>}
      {!s.geminiKey && <button class="btn btn-primary press" onClick={() => open({ kind: 'sheet', name: 'app' })}>Add the Gemini key</button>}
      {turns.length === 0 && s.geminiKey && <div class="chips">{chips.map((c) => <button class="pill press" onClick={() => send(c)}>{c}</button>)}</div>}
      {turns.map((t, i) => (
        <>
          <div class="bubble">{t.q}</div>
          <div class={`answer${t.err ? ' err' : ''}`}>
            {t.a || <span class="row"><Spinner />Thinking…</span>}
            {t.action && (
              <div class="proposal">
                <span>{t.action.day == null ? `Take ${t.action.place} off its day?` : `Move ${t.action.place} to Day ${t.action.day}?`}</span>
                {t.applied ? <span class="chip ok">Done · Undo from the toast</span> : (
                  <div class="row"><button class="btn btn-primary btn-sm press" onClick={() => apply(i, t.action!)}>Apply</button><button class="btn btn-quiet btn-sm press" onClick={() => setTurns((x) => x.map((y, k) => (k === i ? { ...y, action: undefined } : y)))}>Not now</button></div>
                )}
              </div>
            )}
          </div>
        </>
      ))}
      <div ref={end} />
    </Sheet>
  )
}

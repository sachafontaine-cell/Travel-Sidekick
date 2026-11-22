import type { ComponentChildren } from 'preact'
import { useEffect, useLayoutEffect } from 'preact/hooks'
import { close } from './lib/nav'
import { lastChange, undo } from './lib/data'
import { CREST_PATH, CREST_VIEWBOX } from './lib/crest'
import type { Badge, Place } from './lib/model'
import type { MustState } from './lib/musts'

const svg = (d: ComponentChildren, fill = false) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>
)
export const Icon = {
  sun: () => svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3L7 7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7" /></>),
  plan: () => svg(<><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7 13.5h4M7 17h7" /></>),
  bag: () => svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>),
  star: () => svg(<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />, true),
  starOff: () => svg(<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />),
  x: () => svg(<path d="M6 6l12 12M18 6L6 18" />),
  back: () => svg(<path d="M15 5l-7 7 7 7" />),
  chev: () => svg(<path d="M9 5l7 7-7 7" />),
  down: () => svg(<path d="M6 9l6 6 6-6" />),
  up: () => svg(<path d="M6 15l6-6 6 6" />),
  grip: () => svg(<path d="M5 8h14M5 12h14M5 16h14" />),
  out: () => svg(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
  gear: () => svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  chat: () => svg(<><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>),
  send: () => svg(<path d="M12 19V5M6 11l6-6 6 6" />),
  check: () => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  dots: () => svg(<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>, true),
  filter: () => svg(<path d="M4 6h16M7 12h10M10 18h4" />),
  plus: () => svg(<path d="M12 5v14M5 12h14" />),
  refresh: () => svg(<><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>),
  walk: () => svg(<><circle cx="13" cy="4.5" r="1.8" /><path d="M10 21l2-6 3 2v4M8.5 11l2.5-3.5 3 1.5 2 3M11 8l-1 6" /></>),
  train: () => svg(<><rect x="6" y="3" width="12" height="13" rx="3" /><path d="M6 10h12M9 19l-2 2M15 19l2 2M9 13h.01M15 13h.01" /></>),
  rest: () => svg(<><path d="M3 18v-6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6M3 15h18M6 9V6" /></>),
  photo: () => svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" /></>),
  car: () => svg(<><path d="M5 16V11l2-5h10l2 5v5" /><path d="M3 16h18v3H3z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" /><path d="M5 11h14" /></>),
  search: () => svg(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  cloud: () => svg(<><path d="M7 17a4 4 0 1 1 1-7.9A5 5 0 0 1 17.5 10a3.5 3.5 0 0 1-.5 7z" /><path d="M9 20l-1 1.5M13 20l-1 1.5M17 20l-1 1.5" /></>),
}

export function Crest({ size = 34 }: { size?: number }) {
  return <svg class="crest" style={{ width: size, height: size }} viewBox={CREST_VIEWBOX} role="img" aria-label="Fontaine family crest"><path d={CREST_PATH} fill="var(--gold)" fill-rule="evenodd" /></svg>
}

function useEscape(onClose: () => void) {
  // Layout effect: listening from the moment the sheet is on screen (a quick Escape isn't lost).
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}

/** Slides up from the bottom; tap outside or ✕ to close. */
export function Sheet({ title, children, foot, onClose = close }: { title: string; children: ComponentChildren; foot?: ComponentChildren; onClose?: () => void }) {
  useEscape(onClose)
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head"><span class="grabber" /><div class="between"><h2 class="h2">{title}</h2><button class="iconbtn ring press" aria-label="Close" onClick={onClose}><Icon.x /></button></div></div>
        <div class="sheet-body">{children}</div>
        {foot && <div class="sheet-foot">{foot}</div>}
      </div>
    </div>
  )
}

/** A centered dialog; tap outside or ✕ to close. */
export function Dialog({ label, children }: { label: string; children: ComponentChildren }) {
  useEscape(close)
  return (
    <div class="scrim center" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  )
}

export function Stepper({ label, hint, value, show, step, min, max, custom, onChange }: { label: string; hint?: string; value: number; show: (v: number) => string; step: number; min: number; max: number; custom?: boolean; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)))
  return (
    <div class="stepper">
      <div class="grow"><div class="stepper-label">{label}</div>{hint && <div class="muted small">{hint}{custom && <span class="custom-tag">Custom</span>}</div>}</div>
      <button class="round press" aria-label={`Less: ${label}`} disabled={value <= min} onClick={() => set(value - step)}>−</button>
      <span class={`stepper-value num${custom ? ' custom' : ''}`} aria-live="polite">{show(value)}</span>
      <button class="round press" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => set(value + step)}>+</button>
    </div>
  )
}

export function Seg<T extends string | number>({ options, value, onChange, label }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string }) {
  return <div class="seg" role="group" aria-label={label}>{options.map(([v, l]) => <button class={value === v ? 'on press' : 'press'} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>
}

export function BadgeChip({ p }: { p: Pick<Place, 'must' | 'badge'> }) {
  if (p.must) return <span class="chip star"><Icon.star />Must-see</span>
  if (p.badge === 'trap') return <span class="chip trap">Tourist trap</span>
  return null
}
const BADGE_TEXT: Partial<Record<Badge, [string, string]>> = { gem: ['Hidden gem', 'ok'], depends: ['Depends', 'amber'], worth: ['Worth it', 'plain'], trap: ['Tourist trap', 'trap'] }
export function BadgeFull({ p }: { p: Pick<Place, 'must' | 'badge'> }) {
  if (p.must) return null
  const b = BADGE_TEXT[p.badge]
  return b ? <span class={`chip ${b[1]}`}>{b[0]}</span> : null
}

const STATE: Record<MustState, [string, string]> = { done: ['Done', 'plain'], scheduled: ['Scheduled', 'ok'], risk: ['At risk', 'amber'], last: ['Last chance', 'red'], missed: ['No day left', 'red'] }
export const StateChip = ({ s }: { s: MustState }) => <span class={`chip ${STATE[s][1]}`}>{STATE[s][0]}</span>

/** "Louvre skipped · Undo" after every change that has a label. */
export function UndoToast() {
  const c = lastChange.use()
  useEffect(() => {
    if (!c) return
    const t = setTimeout(() => { if (lastChange.get() === c) lastChange.set(null) }, 5000)
    return () => clearTimeout(t)
  }, [c])
  if (!c) return null
  return <div class="toast" role="status"><span>{c.label}</span><button class="press" onClick={undo}>Undo</button></div>
}

export function Spinner() { return <span class="spinner" aria-hidden="true" /> }

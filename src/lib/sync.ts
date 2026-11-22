// Sync between the two phones through the family's private Google script. Changes are saved on
// the phone first and sent in the background; the other phone pulls them when opened and every
// minute while open. The newest change wins, per place / day / trip.
import { createStore, DEMO } from './store'
import type { Destination } from './model'
import { merge, outbox, settings, whenChanged, type Rec } from './data'
import { afterMerge } from './found'

/** The script version this app needs; an older script is asked to update itself. */
export const SCRIPT_NEEDED = 6

export const cursor = createStore<number>(0, 'cursor')
/** The script's last email check: when, what it added, or why it failed. */
export interface Scan { at: number; added?: number; trips?: number; error?: string }
export interface Booking { name: string; kind: string; date: string; time?: string; lat?: number | null; lng?: number | null; note?: string }
/** A trip the script found in email that the family hasn't made: shown with Add / Not this one. */
export interface FoundTrip { id: string; destination: string; dest: Destination; start: string; end: string; bookings: Booking[] }
export const syncState = createStore<{ at?: number; error?: string; script?: number; scan?: Scan | null; asked?: number; found?: FoundTrip[] }>({}, 'sync-state')

/** The family key from the link, or the Control Center's on this phone (same web address). */
export function familyKey(): string {
  const own = settings.get().familyKey
  if (own) return own
  try { const v = localStorage.getItem('fcc-key'); return v ? String(JSON.parse(v) || '') : '' } catch { return '' }
}
export const connected = () => !DEMO && !!settings.get().api && !!familyKey()

export async function call<T = any>(body: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
  const api = settings.get().api
  if (!api) throw new Error('Not connected to the family script.')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // Plain text avoids the browser's extra pre-check request (same trick as the Control Center).
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ k: familyKey(), ...body }), signal: ctrl.signal, redirect: 'follow' })
    if (!r.ok) throw new Error(`Script error ${r.status}`)
    const j = await r.json()
    if (j?.error) throw new Error(String(j.error))
    return j as T
  } finally { clearTimeout(t) }
}

let running = false
let again = false
export async function syncNow(): Promise<void> {
  if (!connected()) return
  if (running) { again = true; return }
  running = true
  try {
    const sending = outbox.get()
    const s = settings.get()
    const res = await call<{ now: number; recs: Rec[]; v: number; gk?: string; scan?: Scan | null; found?: FoundTrip[] }>({ op: 'sync', since: cursor.get(), put: sending, me: s.me ?? '', wantKey: !s.geminiKey, app: __VERSION__ })
    outbox.set((o) => o.filter((r) => !sending.some((x) => x.coll === r.coll && x.id === r.id && x.at === r.at)))
    merge(res.recs ?? [])
    afterMerge(res.recs ?? [])
    cursor.set(res.now)
    if (res.gk && !settings.get().geminiKey) settings.set({ ...settings.get(), geminiKey: res.gk })
    syncState.set({ ...syncState.get(), at: Date.now(), script: res.v, scan: res.scan ?? null, found: Array.isArray(res.found) ? res.found : [], error: undefined })
    // A key saved before the script was connected: hand it over now (the script reads bookings with it).
    const k = settings.get()
    if (k.geminiKey && !k.keyShared) void shareKey(k.geminiKey)
    if ((res.v ?? 0) < SCRIPT_NEEDED) {
      // Ask the script to update itself; report if it can't, so the fix is visible in ⚙.
      void call<{ ok?: boolean; v?: number }>({ op: 'update' }, 90000).then((u) => syncState.set({ ...syncState.get(), script: u.v ?? res.v, error: undefined }), (e) => syncState.set({ ...syncState.get(), error: `Script update failed: ${e instanceof Error ? e.message : e}` }))
    }
  } catch (e) {
    syncState.set({ ...syncState.get(), error: e instanceof Error ? e.message : 'Sync failed' })
  } finally {
    running = false
    if (again) { again = false; void syncNow() }
  }
}

/** Gives the Gemini key to the script so the other phone gets it on its next sync. */
export async function shareKey(gk: string): Promise<boolean> {
  if (!connected()) return false
  try { await call({ op: 'setKey', gk }); settings.set({ ...settings.get(), keyShared: true }); return true } catch { return false }
}
export const setAlerts = (emails: string[]) => call({ op: 'setAlerts', emails })
export const setKayak = (url: string) => call({ op: 'setKayak', url })
/**
 * Asks the script to read new booking emails (and the KAYAK calendar) in the background. Nothing
 * waits: new bookings and trips arrive with the next syncs (checked again after 1 and 2.5 minutes).
 */
export async function scanEmail(): Promise<void> {
  if (!connected()) return
  await call({ op: 'scan' }, 30000)
  syncState.set({ ...syncState.get(), asked: Date.now() })
  setTimeout(() => void syncNow(), 75000)
  setTimeout(() => void syncNow(), 150000)
}

/** "Not this one": the script won't suggest this trip again. */
export async function dismissFound(id: string) {
  syncState.set({ ...syncState.get(), found: (syncState.get().found ?? []).filter((f) => f.id !== id) })
  if (connected()) await call({ op: 'dismiss', id }).catch(() => {})
}

export function startSync() {
  if (DEMO) return
  let t: ReturnType<typeof setTimeout> | undefined
  whenChanged(() => { clearTimeout(t); t = setTimeout(syncNow, 1500) })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow() })
  addEventListener('online', () => void syncNow())
  setInterval(() => { if (document.visibilityState === 'visible') void syncNow() }, 60000)
  void syncNow()
}


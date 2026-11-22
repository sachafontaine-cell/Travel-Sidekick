// Sync between the two phones through the family's private Google script. Changes are saved on
// the phone first and sent in the background; the other phone pulls them when opened and every
// minute while open. The newest change wins, per place / day / trip.
import { createStore, DEMO } from './store'
import { merge, outbox, settings, whenChanged, type Rec } from './data'

/** The script version this app needs; an older script is asked to update itself. */
export const SCRIPT_NEEDED = 2

export const cursor = createStore<number>(0, 'cursor')
export const syncState = createStore<{ at?: number; error?: string; script?: number }>({})

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
    const res = await call<{ now: number; recs: Rec[]; v: number; gk?: string }>({ op: 'sync', since: cursor.get(), put: sending, me: s.me ?? '', wantKey: !s.geminiKey, app: __VERSION__ })
    outbox.set((o) => o.filter((r) => !sending.some((x) => x.coll === r.coll && x.id === r.id && x.at === r.at)))
    merge(res.recs ?? [])
    cursor.set(res.now)
    if (res.gk && !settings.get().geminiKey) settings.set({ ...settings.get(), geminiKey: res.gk })
    syncState.set({ at: Date.now(), script: res.v })
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
export interface FoundTrip { destination: string; start: string; end: string; bookings: Booking[] }
/** Trips happening now or coming up, from booking emails and the KAYAK calendar (script v2+). */
export async function findTrips(): Promise<FoundTrip[]> {
  const j = await call<{ trips?: FoundTrip[]; error?: string }>({ op: 'trips' }, 120000)
  return Array.isArray(j.trips) ? j.trips : []
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

export interface Booking { name: string; kind: 'flight' | 'hotel' | 'ticket' | 'meal' | 'other'; date: string; time?: string; lat?: number; lng?: number; note?: string }
/** Bookings found in the family inbox for these dates and place (read by the script). */
export async function fetchBookings(dest: string, start: string, end: string): Promise<Booking[]> {
  if (!connected()) return []
  const j = await call<{ bookings?: Booking[] }>({ op: 'bookings', dest, start, end }, 90000)
  return Array.isArray(j.bookings) ? j.bookings : []
}

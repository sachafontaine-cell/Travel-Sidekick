// All trip data lives on the phone and every screen reads it from memory. Every change goes
// through `save`, which stamps it (who, when), keeps an Undo, and queues it for the other phone.
import { realLegs } from './legs'
import type { DayMeta, Energy, Place, Trip } from './model'
import { createStore, DEMO, uid } from './store'
import { localNow } from './time'
import { dayIndex, planAll, type DayPlan } from './planner'

export const trips = createStore<Record<string, Trip>>({}, 'trips')
export const places = createStore<Record<string, Place>>({}, 'places')
export const days = createStore<Record<string, DayMeta>>({}, 'days')

export interface Settings {
  /** Who this phone belongs to (a name from the trip's people). */
  me?: string
  geminiKey?: string
  geminiModel?: string
  /** Google script address and family key (from the family link). */
  api?: string
  familyKey?: string
  alerts?: string[]
  /** A family link whose script address wasn't a web app URL (shown as a fix-it hint). */
  badApi?: string
  /** The Gemini key has been handed to the family script. */
  keyShared?: boolean
  kayak?: string
  energy?: { date: string; level: Energy }
  /** The trip last open on this phone: the app reopens on it. */
  lastTrip?: string
}
export const settings = createStore<Settings>({}, 'settings')

// ---- Sync queue: records changed here and not yet sent to the Google script.
export type Coll = 'trip' | 'place' | 'day'
export interface Rec { coll: Coll; id: string; data: Trip | Place | DayMeta | null; at: number }
export const outbox = createStore<Rec[]>([], 'outbox')
let onChange: (() => void) | undefined
export const whenChanged = (fn: () => void) => { onChange = fn }

const storeOf = (c: Coll) => (c === 'trip' ? trips : c === 'place' ? places : days) as unknown as ReturnType<typeof createStore<Record<string, { at: number }>>>

function queue(rec: Rec) {
  if (DEMO) return
  outbox.set((o) => [...o.filter((r) => !(r.coll === rec.coll && r.id === rec.id)), rec])
  onChange?.()
}

// ---- Undo: the last change (one step) can be taken back from a toast.
interface Snapshot { label: string; before: Rec[] }
export const lastChange = createStore<Snapshot | null>(null)

type AnyRec = Trip | Place | DayMeta
function write(coll: Coll, recs: AnyRec[], deleted: string[] = []) {
  const s = storeOf(coll)
  const next = { ...s.get() } as Record<string, AnyRec>
  for (const r of recs) next[r.id] = r
  for (const id of deleted) delete next[id]
  s.set(next as never)
}

/** Save changed records (stamped now, by this phone). `label` shows in the Undo toast. */
export function save(coll: Coll, recs: AnyRec[], label?: string, deleted: string[] = []) {
  const at = Date.now()
  const by = settings.get().me
  const cur = storeOf(coll).get() as Record<string, AnyRec>
  if (label) lastChange.set({ label, before: [...recs.map((r) => r.id), ...deleted].map((id) => ({ coll, id, data: (cur[id] as AnyRec) ?? null, at })) })
  const stamped = recs.map((r) => ({ ...r, at, by }))
  write(coll, stamped, deleted)
  for (const r of stamped) queue({ coll, id: r.id, data: r, at })
  for (const id of deleted) queue({ coll, id, data: null, at })
}

export function undo() {
  const snap = lastChange.get()
  if (!snap) return
  lastChange.set(null)
  const byColl = new Map<Coll, Rec[]>()
  for (const r of snap.before) byColl.set(r.coll, [...(byColl.get(r.coll) ?? []), r])
  for (const [coll, recs] of byColl) {
    save(coll, recs.filter((r) => r.data).map((r) => r.data as AnyRec), undefined, recs.filter((r) => !r.data).map((r) => r.id))
  }
}

/** Apply records from the other phone: the newest change wins, per record. */
export function merge(incoming: Rec[]) {
  const pendingIds = new Set(outbox.get().map((r) => r.coll + ':' + r.id))
  for (const coll of ['trip', 'place', 'day'] as Coll[]) {
    const cur = storeOf(coll).get() as Record<string, AnyRec>
    const put: AnyRec[] = [], del: string[] = []
    for (const r of incoming) {
      if (r.coll !== coll) continue
      const mine = cur[r.id]
      if (mine && mine.at >= r.at) continue
      if (pendingIds.has(coll + ':' + r.id) && mine && mine.at >= r.at) continue
      if (r.data) put.push(r.data as AnyRec)
      else if (mine) del.push(r.id)
    }
    if (put.length || del.length) write(coll, put, del)
  }
}

// ---- Selectors.
export const tripPlaces = (tripId: string) => Object.values(places.get()).filter((p) => p.trip === tripId)

// ---- Clock: destination time. The sample trip is frozen at Day 3, 11:40.
export const DEMO_NOW = { day: 3, min: 11 * 60 + 40 }
export function nowIn(trip: Trip): { date: string; min: number; day: number } {
  if (DEMO) {
    const d = new Date(Date.UTC(+trip.start.slice(0, 4), +trip.start.slice(5, 7) - 1, +trip.start.slice(8, 10) + DEMO_NOW.day - 1))
    const date = d.toISOString().slice(0, 10)
    return { date, min: DEMO_NOW.min, day: DEMO_NOW.day }
  }
  const { date, min } = localNow(trip.dest.tz)
  return { date, min, day: dayIndex(trip, date) }
}

// Plans are cheap, but every screen asks for them: keep the last result per trip.
const planCache = new Map<string, { key: unknown[]; plans: DayPlan[] }>()
export function plansFor(trip: Trip): DayPlan[] {
  const key = [trip, places.get(), days.get(), realLegs.get()]
  const hit = planCache.get(trip.id)
  if (hit && hit.key.every((k, i) => k === key[i])) return hit.plans
  const plans = planAll(trip, tripPlaces(trip.id), days.get())
  planCache.set(trip.id, { key, plans })
  return plans
}

export const newId = uid

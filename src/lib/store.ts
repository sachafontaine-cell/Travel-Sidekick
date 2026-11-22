// A tiny shared value: read it anywhere, components re-render when it changes, and (when given
// a key) it is saved on the phone. The sample trip (?demo) uses its own space, never your data.
import { useEffect, useState } from 'preact/hooks'

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(l: () => void): () => void
  use(): T
}

export const DEMO = typeof location !== 'undefined' && /[?&]demo\b/.test(location.search + location.hash)
const PREFIX = DEMO ? 'ts-demo:' : 'ts:'

const mem = new Map<string, string>()
function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try { if (typeof localStorage !== 'undefined') return localStorage } catch { /* blocked */ }
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
}

export function readSaved<T>(key: string): T | undefined {
  try { const s = storage().getItem(PREFIX + key); return s == null ? undefined : (JSON.parse(s) as T) } catch { return undefined }
}
// Writes are batched to the next idle moment: a tap never waits for the phone's storage.
const pending = new Map<string, unknown>()
let flushQueued = false
function flush() {
  flushQueued = false
  for (const [k, v] of pending) {
    try { if (v === undefined || v === null) storage().removeItem(PREFIX + k); else storage().setItem(PREFIX + k, JSON.stringify(v)) } catch { /* full or blocked */ }
  }
  pending.clear()
}
export function writeSaved(key: string, v: unknown) {
  pending.set(key, v)
  if (flushQueued) return
  flushQueued = true
  if (typeof requestIdleCallback === 'function') requestIdleCallback(flush, { timeout: 500 })
  else setTimeout(flush, 0)
}
if (typeof addEventListener === 'function') addEventListener('pagehide', flush)
export const flushNow = flush

export function createStore<T>(initial: T, key?: string): Store<T> {
  let value: T = (key ? readSaved<T>(key) : undefined) ?? initial
  const listeners = new Set<() => void>()
  const store: Store<T> = {
    get: () => value,
    set(next) {
      const v = typeof next === 'function' ? (next as (p: T) => T)(value) : next
      if (v === value) return
      value = v
      if (key) writeSaved(key, v)
      listeners.forEach((l) => l())
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l) } },
    use() {
      const [, force] = useState(0)
      useEffect(() => store.subscribe(() => force((n) => n + 1)), [])
      return value
    },
  }
  return store
}

/** Re-render when any of several stores changes. */
export function useStores(...stores: Store<unknown>[]) {
  const [, force] = useState(0)
  useEffect(() => { const offs = stores.map((s) => s.subscribe(() => force((n) => n + 1))); return () => offs.forEach((o) => o()) }, [])
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

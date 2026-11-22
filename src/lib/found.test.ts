import { describe, expect, it } from 'vitest'
import { trips } from './data'
import { afterMerge } from './found'
import type { Trip } from './model'

describe('a trip found in email', () => {
  it('gets currency, language and the family from the last trip', () => {
    const base = { vibes: {}, budget: { all: 2 }, pace: 'balanced', dayStart: 540, dayEnd: 1260, downtime: { on: true, minutes: 90 }, food: '', nos: [], home: 'USD', at: 1 } as const
    const cabo = { ...base, id: 'cabo', name: 'Cabo', start: '2026-11-21', end: '2026-11-26', dest: { name: 'Cabo', lat: 0, lng: 0, tz: 'America/Mazatlan', country: 'MX', currency: 'MXN', lang: 'es' }, people: [{ id: 'a', name: 'Sacha', age: 47 }, { id: 'b', name: 'Félix', age: 8 }] } as unknown as Trip
    const rome = { ...base, id: 'rome', name: 'Rome', found: 'email', start: '2027-03-10', end: '2027-03-16', dest: { name: 'Rome, Italy', lat: 41.9, lng: 12.5, tz: 'Europe/Rome', country: 'IT', currency: '', lang: '' }, people: [] } as unknown as Trip
    trips.set({ cabo, rome })
    afterMerge([{ coll: 'trip', id: 'rome', data: rome, at: 2 }])
    const done = trips.get().rome
    expect(done.dest).toMatchObject({ currency: 'EUR', lang: 'it' })
    expect(done.people.map((p) => p.name)).toEqual(['Sacha', 'Félix'])
  })
})

import { describe, expect, it } from 'vitest'
import { isDup, passes } from './deep'
import { demoTrip } from './demo'

describe('deep search', () => {
  it('spots the same place across searches', () => {
    const list = [{ name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945 }, { name: 'Playa del Amor', lat: 22.8766, lng: -109.9035 }]
    expect(isDup({ name: 'The Eiffel Tower', lat: 48.8583, lng: 2.2944 }, list)).toBe(true)
    expect(isDup({ name: 'Playa del Amor (Lovers Beach)', lat: 22.8768, lng: -109.9031 }, list)).toBe(true)
    expect(isDup({ name: 'Playa Chileno', lat: 22.95, lng: -109.80 }, list)).toBe(false)
  })
  it('searches each kind of place, your dates, near home, and real places from the map', () => {
    const { trip } = demoTrip()
    const p = passes(trip, ['Jardin des Plantes'])
    expect(p.map((x) => x.id)).toEqual(expect.arrayContaining(['iconic', 'nature', 'tours', 'dates', 'near', 'kids', 'food', 'map']))
    expect(passes({ ...trip, base: undefined, people: [{ id: 'a', name: 'A', age: 40 }] }, []).map((x) => x.id)).not.toContain('kids')
  })
})

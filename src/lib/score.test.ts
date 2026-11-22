import { describe, expect, it } from 'vitest'
import { rescore, worthOf } from './score'
import type { Place, Trip } from './model'

describe('worth = the bars', () => {
  const p = { value: 7, sub: { iconic: 9, vibe: 10, hassle: 8, kid: 9 } }
  it('is the weighted average, to the half point', () => {
    expect(worthOf(p, true)).toBe(9) // 2.7 + 3 + 1.05 + 1.35 + 0.8 = 8.9
    expect(worthOf({ value: 10, sub: { iconic: 10, vibe: 10, hassle: 10, kid: 10 } }, false)).toBe(10)
  })
  it('redoes old scores once', () => {
    const trip = { people: [{ age: 8 }] } as Trip
    const old = { ...p, worth: 10, id: 'x' } as unknown as Place
    const [r] = rescore(trip, [old])
    expect(r.worth).toBe(9)
    expect(rescore(trip, [r])).toEqual([])
  })
})

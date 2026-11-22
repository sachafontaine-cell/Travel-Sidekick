import { describe, expect, it } from 'vitest'
import { groupOf } from './groups'

describe('8 groups', () => {
  it('uses the new kinds directly', () => {
    expect(groupOf({ kind: 'tour', name: 'Anything' })).toBe('tour')
    expect(groupOf({ kind: 'snack', name: 'Berthillon' })).toBe('food')
  })
  it('sorts older kinds by name', () => {
    expect(groupOf({ kind: 'park', name: 'San Diego Zoo' })).toBe('kids')
    expect(groupOf({ kind: 'park', name: 'Luxembourg Gardens' })).toBe('outdoors')
    expect(groupOf({ kind: 'sight', name: "Playa del Amor" })).toBe('outdoors')
    expect(groupOf({ kind: 'show', name: 'Sunset sailing cruise' })).toBe('tour')
    expect(groupOf({ kind: 'show', name: 'Moulin Rouge' })).toBe('show')
    expect(groupOf({ kind: 'sight', name: 'Eiffel Tower' })).toBe('sight')
    expect(groupOf({ kind: 'other', name: 'Flight AC 123', booked: 'Booked' })).toBe('other')
  })
})

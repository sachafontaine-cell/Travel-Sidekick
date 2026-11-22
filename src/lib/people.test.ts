import { describe, expect, it, vi } from 'vitest'
import { ageOn, defaultFamily } from './people'

describe('default family', () => {
  it('works out ages from birthdays on the trip date', () => {
    expect(ageOn('2016-12-01', '2026-11-21')).toBe(9)
    expect(ageOn('2016-11-21', '2026-11-21')).toBe(10)
  })
  it('copies the latest trip, else reads Chef Luc on this phone', () => {
    const latest = defaultFamily([{ start: '2026-02-14', at: 1, people: [{ id: 'a', name: 'Alex', age: 47 }] }, { start: '2025-06-01', at: 2, people: [{ id: 'b', name: 'Old', age: 1 }] }], '2026-11-21')
    expect(latest.map((p) => p.name)).toEqual(['Alex'])
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'chef-luc:settings' ? JSON.stringify({ family: [{ name: 'Sam', adult: true }, { name: 'Mia', adult: false, birth: '2016-03-02' }] }) : null) })
    const fromLuc = defaultFamily([], '2026-11-21')
    expect(fromLuc.map((p) => [p.name, p.age])).toEqual([['Sam', 40], ['Mia', 10]])
    vi.unstubAllGlobals()
  })
})

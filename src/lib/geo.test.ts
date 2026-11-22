import { describe, expect, it } from 'vitest'
import { leg, options } from './geo'

const hotel = { lat: 48.8566, lng: 2.3522 }
const north = (km: number) => ({ lat: hotel.lat + km / 111.2, lng: hotel.lng })

describe('from the hotel: fastest way, but walk if it is only a little longer', () => {
  it('walks short hops', () => expect(leg(hotel, north(0.5), false).mode).toBe('walk'))
  it('walks when only a little longer than the fastest', () => {
    const p = north(0.9), o = options(hotel, p, false)
    expect(o.walk).toBeGreaterThan(Math.min(o.car, o.transit))
    expect(leg(hotel, p, false).mode).toBe('walk')
  })
  it('rides when walking is much longer', () => {
    const l = leg(hotel, north(4), false)
    expect(l.mode).not.toBe('walk')
    expect(l.minutes).toBe(Math.round(Math.min(options(hotel, north(4), false).car, options(hotel, north(4), false).transit)))
  })
  it('drives far away (highway)', () => expect(leg(hotel, north(40), false).mode).toBe('car'))
})

// Distances and travel times, estimated instantly on the phone (no paid map service).
// Walk, public transit or car (yours, a taxi or a ride app): whichever is fastest, except that
// walking wins when it's only a little longer (5 min, or a quarter of the trip, whichever is more).

export interface Point { lat: number; lng: number }
export type Mode = 'walk' | 'transit' | 'car'
export interface Leg { minutes: number; walkKm: number; mode: Mode; km: number }

export const KM_PER_MI = 1.609344

export function km(a: Point, b: Point): number {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

const STREET = 1.3

/** Minutes each way would take: walk, transit (walk to and from stops, a wait, the ride), car. */
export function options(a: Point, b: Point, youngKids: boolean): Record<Mode, number> {
  const d = km(a, b), road = d * STREET
  const walk = (road / (youngKids ? 3.6 : 4.6)) * 60
  const transit = d < 1 ? Infinity : 15 + (d / 22) * 60
  const car = 8 + (road / (road > 15 ? 55 : 28)) * 60 // getting the car or a ride, then city or highway speed
  return { walk, transit, car }
}

/** "Just a little longer": up to 5 min, or a quarter of the fastest way, more than the fastest. */
export const walkSlack = (fastest: number) => Math.max(5, fastest * 0.25)

export function leg(a: Point | undefined, b: Point | undefined, youngKids: boolean): Leg {
  if (!a || !b) return { minutes: 0, walkKm: 0, mode: 'walk', km: 0 }
  const o = options(a, b, youngKids)
  const d = km(a, b)
  const best = Math.min(o.transit, o.car)
  if (o.walk <= best + walkSlack(best)) return { minutes: Math.max(1, Math.round(o.walk)), walkKm: d * STREET, mode: 'walk', km: d }
  return o.transit <= o.car
    ? { minutes: Math.round(o.transit), walkKm: 0.6, mode: 'transit', km: d }
    : { minutes: Math.round(o.car), walkKm: 0.1, mode: 'car', km: d }
}

export const MODE_NAME: Record<Mode, string> = { walk: 'walk', transit: 'transit', car: 'by car' }
/** "12 min walk", "25 min by car". */
export const legText = (l: Pick<Leg, 'minutes' | 'mode'>) => `${l.minutes} min ${MODE_NAME[l.mode]}`

export const miles = (km: number) => km / KM_PER_MI

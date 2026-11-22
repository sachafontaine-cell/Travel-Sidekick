// Distances and travel times, estimated instantly on the phone. Straight-line distance times a
// street factor; walking speed drops with young kids. Far hops are by metro/RER.

export interface Point { lat: number; lng: number }
export interface Leg { minutes: number; walkKm: number; mode: 'walk' | 'metro' }

export const KM_PER_MI = 1.609344

export function km(a: Point, b: Point): number {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

const STREET = 1.3
/** Above this walking distance, take public transport. */
export const WALK_MAX_KM = 2.2

export function leg(a: Point | undefined, b: Point | undefined, youngKids: boolean): Leg {
  if (!a || !b) return { minutes: 0, walkKm: 0, mode: 'walk' }
  const walk = km(a, b) * STREET
  const speed = youngKids ? 3.6 : 4.6 // km/h
  if (walk <= WALK_MAX_KM) return { minutes: Math.max(1, Math.round((walk / speed) * 60)), walkKm: walk, mode: 'walk' }
  // Metro/RER: walk to and from stations, a wait, then the ride (~25 km/h door to door).
  return { minutes: Math.round(10 + 5 + (km(a, b) / 25) * 60), walkKm: 0.6, mode: 'metro' }
}

export const miles = (km: number) => km / KM_PER_MI

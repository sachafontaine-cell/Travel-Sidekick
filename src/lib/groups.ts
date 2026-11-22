// The 8 groups of Plan → All, as most guidebooks and TripAdvisor split things to do.
// Places saved before the groups existed have older, broader kinds: their name decides.
import type { Place } from './model'

export type Group = 'sight' | 'museum' | 'outdoors' | 'tour' | 'kids' | 'show' | 'food' | 'shop' | 'other'

const KIDS = /\b(zoo|aquarium|theme park|amusement|water ?park|playground|disney|legoland|safari|petting|acclimatation|aquapark|parc d'attractions)\b/i
const TOUR = /\b(tour|cruise|boat|snorkel\w*|dive|diving|kayak|sail\w*|excursion|class|workshop|bike|cycling|whale|fishing|zip ?line|horse\w*|day trip)\b/i
const OUT = /\b(beach|playa|garden|gardens|jardin|park|hike|trail|lake|falls|cove|bay|island)\b/i

export function groupOf(p: Pick<Place, 'kind' | 'name' | 'booked'>): Group {
  const k = p.kind
  if (k === 'meal' || k === 'snack') return 'food'
  if (k === 'museum' || k === 'shop' || k === 'outdoors' || k === 'tour' || k === 'kids') return k
  // Older kinds: sight, park, show, other.
  if (KIDS.test(p.name)) return 'kids'
  if (k === 'other' && p.booked) return 'other'
  if (TOUR.test(p.name)) return 'tour'
  if (k === 'park' || (k !== 'show' && OUT.test(p.name))) return 'outdoors'
  if (k === 'show') return 'show'
  return k === 'other' ? 'other' : 'sight'
}

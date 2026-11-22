// The shapes everything else agrees on. Times of day are minutes after midnight, destination time.
// Dates are 'YYYY-MM-DD' in the destination. `at` is when a record last changed (ms), for sync.

export type Vibe = 'cultural' | 'family' | 'food' | 'nature' | 'adventure' | 'relaxing' | 'shopping' | 'nightlife'

export const VIBES: { id: Vibe; name: string; says: string }[] = [
  { id: 'cultural', name: 'Cultural', says: 'Museums, history and landmarks.' },
  { id: 'family', name: 'Family', says: 'Kid-friendly first: parks, hands-on, short visits.' },
  { id: 'food', name: 'Food', says: 'Markets, bakeries and local dishes.' },
  { id: 'nature', name: 'Nature', says: 'Parks, gardens, views and photo spots.' },
  { id: 'adventure', name: 'Adventure', says: 'Climbs, bikes, boats: a little thrill.' },
  { id: 'relaxing', name: 'Relaxing', says: 'Slow mornings, cafés, pools and spas.' },
  { id: 'shopping', name: 'Shopping', says: 'Shops, flea markets and souvenirs.' },
  { id: 'nightlife', name: 'Nightlife', says: 'Evening shows, city lights, late dinners.' },
]

export type Badge = 'must' | 'worth' | 'depends' | 'trap' | 'gem'
export const BADGE: Record<Badge, string> = { must: 'Must-see', worth: 'Worth it', depends: 'Depends', trap: 'Tourist trap', gem: 'Hidden gem' }

/** Where a place sits in the master list. */
export type Status = 'picked' | 'maybe' | 'out'

/** 'meal' = a sit-down lunch or dinner (the planner keeps it at meal times); 'snack' has no meal rule. */
export type Kind = 'sight' | 'museum' | 'park' | 'meal' | 'snack' | 'show' | 'shop' | 'other'

/** Opening hours per weekday, Sunday first. null = closed that day. */
export interface Hours {
  /** Missing when only some dates are known. */
  week?: ([number, number] | null)[]
  /** Checked with Google for specific dates (holidays, special closures win over the week). */
  dates?: Record<string, [number, number] | null>
  checkedAt?: number
  source?: 'google' | 'ai' | 'osm'
}

export interface Place {
  id: string
  trip: string
  name: string
  kind: Kind
  lat: number
  lng: number
  badge: Badge
  /** The family's call (starts as the AI's). Must-sees are never eliminated. */
  must: boolean
  worth: number
  value: number
  sub: { iconic: number; vibe: number; hassle: number; kid: number }
  rec: 'pay' | 'cheaper' | 'skip'
  recText: string
  why: string
  tip: string
  /** Per person, destination currency; 0 = free. */
  price: number
  /** Time there; `suggested` is the AI's number, kept for the "(suggested …)" hint. */
  minutes: number
  suggested: number
  indoor: boolean
  hours?: Hours
  status: Status
  /** Order in the master list (sortable string key). */
  rank: string
  day?: number | null
  dayRank?: string
  /** A booked time (minutes) that the planner never moves. */
  fixed?: number | null
  booked?: string
  done?: boolean
  /** Being scored by Gemini right now (added by hand). */
  scoring?: boolean
  /** The English Wikipedia article for this place, if Gemini knows one (checked before use). */
  wiki?: string | null
  /** Representative photos (Wikipedia), looked up once. `urls` empty = none found. */
  photos?: { title: string; lang: string; urls: string[]; at: number }
  at: number
  by?: string
}

export interface Person { id: string; name: string; age: number; miles?: number }

export type Level = 1 | 2 | 3
export type Pace = 'slow' | 'balanced' | 'packed'

export interface Destination { name: string; lat: number; lng: number; tz: string; country: string; currency: string; lang: string }

export interface Trip {
  id: string
  name: string
  dest: Destination
  start: string
  end: string
  /** Hotel or home base: downtime happens here. */
  base?: { name: string; lat: number; lng: number }
  vibes: Partial<Record<Vibe, number>>
  budget: { all: Level; lodging?: Level; food?: Level; activities?: Level }
  pace: Pace
  people: Person[]
  dayStart: number
  dayEnd: number
  downtime: { on: boolean; minutes: number }
  food: string
  nos: string[]
  home: string
  /** 1 unit of destination currency in home currency. */
  fx?: { rate: number; at: number }
  /** The list was built (first run done). */
  built?: boolean
  /** Before-you-go checklist ticks. */
  ready?: Record<string, boolean>
  rules?: { title: string; text: string }[]
  at: number
  by?: string
}

/** Per-day choices that are not about one place. */
export interface DayMeta {
  id: string
  trip: string
  day: number
  /** Downtime goes after this place; undefined = automatic (after lunch). */
  downtimeAfter?: string | null
  at: number
  by?: string
}

export type Energy = 'tired' | 'ok' | 'fresh'

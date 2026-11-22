// The sample trip shown with ?demo: a made-up family of four in Paris. Never mixed with real data.
import type { Kind, Place, Trip } from './model'
import { spread } from './rank'

const T = 'demo-paris'
const hm = (s: string) => +s.slice(0, 2) * 60 + +s.slice(3, 5)
/** Same hours every open day; `closed` lists weekdays (0 = Sunday). */
const hours = (open: string, close: string, closed: number[] = []) => ({ week: Array.from({ length: 7 }, (_, i) => (closed.includes(i) ? null : ([hm(open), hm(close)] as [number, number]))), source: 'google' as const })

interface Seed {
  name: string; kind: Kind; lat: number; lng: number; badge: Place['badge']; must?: boolean
  worth: number; value: number; sub: [number, number, number, number]; rec: Place['rec']; recText: string
  why: string; tip: string; price: number; minutes: number; indoor?: boolean; h?: Place['hours']
  status?: Place['status']; day?: number; fixed?: string; booked?: string; done?: boolean
  /** Position within its day (defaults to list order). */
  o?: number
}

const SEEDS: Seed[] = [
  { name: 'Eiffel Tower', kind: 'sight', lat: 48.8584, lng: 2.2945, badge: 'must', must: true, worth: 9.5, value: 7, sub: [10, 8, 5, 8], rec: 'cheaper', recText: 'Do the cheaper version: level 2 by the stairs saves ~€55 for the group.', why: "The one view of Paris you'd regret missing.", tip: 'Book a timed slot ahead; go back at night for the sparkle (free from the lawn).', price: 27, minutes: 120, h: hours('09:30', '23:45'), day: 4 },
  { name: 'Louvre (highlights tour)', kind: 'museum', lat: 48.8606, lng: 2.3376, badge: 'must', must: true, worth: 9, value: 8, sub: [10, 8, 4, 7], rec: 'pay', recText: 'Pay for it, with a 90-minute kid route: Mona Lisa, Egypt, the winged lion.', why: 'The most famous museum in the world, and kids love the mummies.', tip: 'Enter by the Carrousel entrance; skip the pyramid line.', price: 22, minutes: 120, indoor: true, h: hours('09:00', '18:00', [2]), day: 3, o: 1, fixed: '09:30', booked: 'Booked · from your email' },
  { name: "Musée d'Orsay", kind: 'museum', lat: 48.86, lng: 2.3266, badge: 'must', must: true, worth: 9, value: 8, sub: [9, 9, 6, 6], rec: 'pay', recText: 'Pay for it; under-18s are free, so only the adults pay.', why: 'Monet, Van Gogh and the giant clock window.', tip: 'Go straight to the 5th floor, then walk down.', price: 16, minutes: 120, indoor: true, h: hours('09:30', '18:00', [1]) },
  { name: 'Notre-Dame', kind: 'sight', lat: 48.853, lng: 2.3499, badge: 'must', must: true, worth: 9, value: 10, sub: [10, 8, 7, 7], rec: 'pay', recText: 'Free; reserve a timed entry to skip the line.', why: 'Reopened after the fire, and brighter than ever.', tip: 'Look for the new rooster on the spire.', price: 0, minutes: 60, h: hours('07:50', '19:00'), day: 2, done: true },
  { name: 'Sainte-Chapelle', kind: 'sight', lat: 48.8554, lng: 2.345, badge: 'gem', worth: 8.5, value: 9, sub: [8, 9, 7, 7], rec: 'pay', recText: 'Pay for it: 15 minutes of stained glass you will remember.', why: 'A room made of light; best on a sunny afternoon.', tip: 'Combined ticket with the Conciergerie saves a few euros.', price: 13, minutes: 45, indoor: true, h: hours('09:00', '19:00'), day: 3, o: 3 },
  { name: 'Montmartre + Sacré-Cœur', kind: 'sight', lat: 48.8867, lng: 2.3431, badge: 'must', must: true, worth: 8.5, value: 10, sub: [9, 9, 6, 8], rec: 'pay', recText: 'Free. Take the funicular up with a metro ticket.', why: 'Painters, steps and the best free view of Paris.', tip: 'Skip the "free bracelet" guys at the bottom of the steps.', price: 0, minutes: 150, h: hours('06:00', '22:30'), day: 5 },
  { name: 'Arc de Triomphe', kind: 'sight', lat: 48.8738, lng: 2.295, badge: 'must', must: true, worth: 8, value: 7, sub: [9, 7, 6, 7], rec: 'pay', recText: 'Pay for the rooftop; under-18s are free.', why: 'Twelve avenues spinning out like a star.', tip: 'Use the underground passage, never the roundabout.', price: 16, minutes: 60, h: hours('10:00', '23:00'), day: 1, done: true },
  { name: 'Versailles', kind: 'sight', lat: 48.8049, lng: 2.1204, badge: 'must', must: true, worth: 9, value: 7, sub: [10, 8, 3, 7], rec: 'cheaper', recText: 'Do the cheaper version: gardens and Hall of Mirrors, skip the Trianon.', why: 'The palace that every other palace copied.', tip: 'Rent bikes in the gardens; the kids will thank you.', price: 21, minutes: 300, h: hours('09:00', '18:30', [1]), day: 6 },
  { name: 'Luxembourg Gardens', kind: 'park', lat: 48.8462, lng: 2.3372, badge: 'must', must: true, worth: 8, value: 10, sub: [7, 9, 9, 10], rec: 'pay', recText: 'Free. Rent a toy sailboat for the pond (~€5).', why: 'The Paris park where Parisians actually go.', tip: 'Puppet theater on weekends.', price: 0, minutes: 90, h: hours('07:30', '21:00'), day: 2, done: true },
  { name: 'Seine riverside walk', kind: 'sight', lat: 48.8571, lng: 2.3412, badge: 'must', must: true, worth: 8.5, value: 10, sub: [9, 9, 9, 7], rec: 'pay', recText: 'Free, and better than any boat.', why: 'Bridges, booksellers and the light on the water.', tip: 'Start at Pont Neuf, end at Notre-Dame.', price: 0, minutes: 90, day: 1, done: true },
  { name: 'Tuileries Garden', kind: 'park', lat: 48.8622, lng: 2.3315, badge: 'worth', worth: 8, value: 10, sub: [7, 8, 10, 9], rec: 'pay', recText: 'Free; carousel rides ~€3.', why: 'Benches, a carousel and trampolines in summer.', tip: 'The green chairs around the pond are free to use.', price: 0, minutes: 30, h: hours('07:00', '21:00') },
  { name: 'Lunch · Le Fumoir', kind: 'meal', lat: 48.8607, lng: 2.3407, badge: 'worth', worth: 7.5, value: 7, sub: [5, 8, 8, 7], rec: 'pay', recText: 'Worth it for a calm sit-down lunch near the Louvre.', why: 'Kids menu, quiet back room.', tip: 'Ask for the library room.', price: 25, minutes: 75, h: hours('11:00', '23:59'), day: 3, o: 2, fixed: '12:45', booked: 'Table for 4' },
  { name: 'Dinner · Bouillon Chartier', kind: 'meal', lat: 48.8719, lng: 2.3436, badge: 'gem', worth: 8, value: 9, sub: [7, 9, 7, 8], rec: 'pay', recText: 'Pay for it: classic French food at canteen prices.', why: 'A 1896 dining hall, waiters write on the tablecloth.', tip: 'No bookings: arrive by 6:30 PM.', price: 20, minutes: 75, indoor: true, h: hours('11:30', '23:59'), day: 3, o: 4 },
  { name: 'Seine dinner cruise', kind: 'show', lat: 48.8622, lng: 2.3013, badge: 'trap', worth: 5, value: 3, sub: [6, 5, 5, 4], rec: 'skip', recText: 'Skip: pricey food, and a hard no on boats over 1 hr.', why: 'The view is the same from the free river walk.', tip: 'A 1-hour Batobus hop gives the same view.', price: 85, minutes: 150, status: 'out' },
  { name: "Jardin d'Acclimatation", kind: 'park', lat: 48.8781, lng: 2.2633, badge: 'worth', worth: 8, value: 8, sub: [6, 9, 7, 10], rec: 'pay', recText: 'Pay for it if the kids need a break from museums.', why: 'Rides, farm animals and a little train.', tip: 'Ride pass is cheaper than single tickets after 3 rides.', price: 7, minutes: 180, h: hours('10:00', '19:00'), day: 4 },
  { name: 'Cité des Sciences', kind: 'museum', lat: 48.8956, lng: 2.388, badge: 'worth', worth: 8, value: 8, sub: [6, 8, 7, 10], rec: 'pay', recText: 'Pay for it on a rainy day.', why: 'Hands-on science; the kids area is excellent.', tip: 'Book the Cité des enfants slot at the door.', price: 13, minutes: 180, indoor: true, h: hours('09:30', '18:00', [1]), status: 'maybe' },
  { name: 'Catacombs', kind: 'sight', lat: 48.8339, lng: 2.3324, badge: 'depends', worth: 7, value: 5, sub: [8, 6, 4, 4], rec: 'cheaper', recText: 'Depends: spooky for an 8-year-old. Timed tickets sell out.', why: '6 million skulls, 20 m underground.', tip: 'Last entry 7:30 PM; bring a jacket.', price: 29, minutes: 60, h: hours('09:45', '20:30', [1]), status: 'maybe' },
  { name: 'Rodin Museum garden', kind: 'park', lat: 48.8553, lng: 2.3159, badge: 'worth', worth: 7, value: 8, sub: [7, 8, 8, 6], rec: 'cheaper', recText: 'Do the cheaper version: garden-only ticket.', why: 'The Thinker, outside, among roses.', tip: 'Garden ticket is €5.', price: 14, minutes: 75, h: hours('10:00', '18:30', [1]), status: 'maybe' },
  { name: "L'As du Fallafel", kind: 'snack', lat: 48.8573, lng: 2.3591, badge: 'gem', worth: 8, value: 9, sub: [6, 9, 7, 8], rec: 'pay', recText: 'Pay for it: the best cheap lunch in Paris.', why: 'Famous falafel in the Marais.', tip: 'Takeaway window line moves fast.', price: 10, minutes: 40, h: hours('11:00', '23:00', [6]), status: 'maybe' },
  { name: 'Berthillon ice cream', kind: 'snack', lat: 48.8517, lng: 2.3567, badge: 'gem', worth: 8, value: 8, sub: [6, 9, 9, 10], rec: 'pay', recText: 'Pay for it: wild strawberry, trust us.', why: 'Legendary sorbets on Île Saint-Louis.', tip: 'Closed Mon and Tue.', price: 4, minutes: 20, h: hours('10:00', '20:00', [1, 2]), status: 'maybe' },
  { name: 'Shakespeare and Company', kind: 'shop', lat: 48.8526, lng: 2.3471, badge: 'worth', worth: 7, value: 9, sub: [7, 8, 7, 7], rec: 'pay', recText: 'Free to browse; kids corner upstairs.', why: 'The bookshop from the movies.', tip: 'Get the stamp inside your book.', price: 0, minutes: 30, h: hours('10:00', '20:00'), status: 'maybe' },
  { name: 'Galeries Lafayette rooftop', kind: 'shop', lat: 48.8735, lng: 2.332, badge: 'worth', worth: 7, value: 9, sub: [6, 7, 8, 7], rec: 'pay', recText: 'Free rooftop view; skip the shopping.', why: 'Free panorama over the Opéra.', tip: 'Look up at the glass dome on the way.', price: 0, minutes: 45, h: hours('10:00', '20:30'), day: 7 },
]

export function demoTrip(): { trip: Trip; places: Place[] } {
  const at = Date.UTC(2026, 5, 10)
  const trip: Trip = {
    id: T, name: 'Paris',
    dest: { name: 'Paris, France', lat: 48.8566, lng: 2.3522, tz: 'Europe/Paris', country: 'FR', currency: 'EUR', lang: 'fr' },
    start: '2026-06-12', end: '2026-06-18',
    base: { name: 'Hotel, Rue de Rivoli', lat: 48.8625, lng: 2.339 },
    vibes: { cultural: 50, family: 30, food: 20 },
    budget: { all: 2, activities: 3 },
    pace: 'balanced',
    people: [{ id: 'p1', name: 'Alex', age: 47 }, { id: 'p2', name: 'Sam', age: 42 }, { id: 'p3', name: 'Mia', age: 10, miles: 6 }, { id: 'p4', name: 'Leo', age: 8, miles: 7 }],
    dayStart: 630, dayEnd: 1290,
    downtime: { on: true, minutes: 90 },
    food: 'Adventurous, with kid options. Street food: yes.',
    nos: ['Boat tours over 1 hour'],
    home: 'USD', fx: { rate: 1.08, at },
    built: true,
    rules: [
      { title: 'Closing days', text: 'Orsay is closed Mondays, the Louvre Tuesdays, many shops Sundays.' },
      { title: 'Tipping', text: 'Service is included. Round up, or 5–10% for great service.' },
      { title: 'Scams', text: 'Petition clipboards, friendship bracelets, "found" gold rings: say non merci and keep walking.' },
      { title: 'Metro', text: 'Pickpockets on Line 1 and at Eiffel stops. Phone in a front pocket.' },
    ],
    at,
  }
  const ranks = spread(SEEDS.length)
  const byDay = new Map<number, number>()
  const places: Place[] = SEEDS.map((s, i) => {
    const n = s.day ? (byDay.get(s.day) ?? 0) : 0
    if (s.day) byDay.set(s.day, n + 1)
    return {
      id: `demo-${i}`, trip: T, name: s.name, kind: s.kind, lat: s.lat, lng: s.lng, badge: s.badge, must: !!s.must,
      worth: s.worth, value: s.value, sub: { iconic: s.sub[0], vibe: s.sub[1], hassle: s.sub[2], kid: s.sub[3] },
      rec: s.rec, recText: s.recText, why: s.why, tip: s.tip, price: s.price, minutes: s.minutes, suggested: s.minutes,
      indoor: !!s.indoor, hours: s.h ? { ...s.h, checkedAt: Date.now() - 3 * 3600000 } : undefined,
      status: s.status ?? 'picked', rank: ranks[i], day: s.day ?? null, dayRank: s.day ? 'b' + String.fromCharCode(97 + (s.o ?? n)) : undefined,
      fixed: s.fixed ? hm(s.fixed) : null, booked: s.booked, done: s.done, at,
    }
  })
  return { trip, places }
}

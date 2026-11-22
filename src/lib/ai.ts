// What we ask Gemini. AI gives opinions (scores, why, tips); hours are checked with Google
// Search. Only a compact trip summary is sent: never names of the kids, never documents.
import type { Badge, Hours, Kind, Place, Trip } from './model'
import { hasKids, worthOf } from './score'
import { VIBES } from './model'
import { AiError, generate, jsonIn, stream, withModels, answerText } from './gemini'
import { settings } from './data'
import { describe } from './vibes'
import { clock, parseClock, WEEKDAY } from './time'
import { groupLimit } from './people'
import { between } from './rank'

const VIBE_NAMES = Object.fromEntries(VIBES.map((v) => [v.id, v.name]))

export function needKey(): string {
  const k = settings.get().geminiKey
  if (!k) throw new AiError('Add your Gemini key first (Trips → ⚙ This app).')
  return k
}

function useModel<T>(run: (key: string, model: string) => Promise<T>): Promise<T> {
  const key = needKey()
  return withModels(key, settings.get().geminiModel, (m) => run(key, m)).then(({ out, model }) => {
    if (model !== settings.get().geminiModel) settings.set({ ...settings.get(), geminiModel: model })
    return out
  })
}

/** "2 adults (47, 42) and 2 kids (10, 8)": the group, for descriptions written for them. */
export function groupLine(t: Pick<Trip, 'people'>): string {
  const ages = t.people.map((p) => p.age).sort((a, b) => b - a)
  const adults = ages.filter((a) => a >= 18), teens = ages.filter((a) => a >= 13 && a < 18), kids = ages.filter((a) => a < 13)
  const part = (n: number[], one: string, many: string) => n.length ? `${n.length} ${n.length === 1 ? one : many} (${n.join(', ')})` : ''
  return [part(adults, 'adult', 'adults'), part(teens, 'teen', 'teens'), part(kids, 'kid', 'kids')].filter(Boolean).join(' and ') || 'adults'
}
/** Descriptions are redone when the group changes. */
export const groupKey = (t: Pick<Trip, 'people'>) => t.people.map((p) => p.age).sort((a, b) => b - a).join(',')

/** The family and trip in a few lines (ages only, no names). */
export function tripBrief(t: Trip): string {
  const ages = t.people.map((p) => p.age).sort((a, b) => b - a).join(', ')
  const b = ['$', '$$', '$$$']
  return [
    `Destination: ${t.dest.name}. Dates: ${t.start} to ${t.end}.`,
    t.base ? `Staying at: ${t.base.name} (${t.base.lat.toFixed(4)}, ${t.base.lng.toFixed(4)}). Favour good things close to it.` : '',
    `Group: ${groupLine(t)}. Travelers' ages: ${ages}. Group walking limit: ${groupLimit(t).miles} miles/day.`,
    `Vibe: ${describe(t.vibes, VIBE_NAMES)} (percent).`,
    `Budget: overall ${b[t.budget.all - 1]}${t.budget.lodging ? `, lodging ${b[t.budget.lodging - 1]}` : ''}${t.budget.food ? `, food ${b[t.budget.food - 1]}` : ''}${t.budget.activities ? `, activities ${b[t.budget.activities - 1]}` : ''}. Pace: ${t.pace}.`,
    `Day: ${clock(t.dayStart)} to ${clock(t.dayEnd)}${t.downtime.on ? `, ${t.downtime.minutes} min downtime` : ''}.`,
    t.food ? `Food: ${t.food}` : '',
    t.nos.length ? `Hard nos: ${t.nos.join('; ')}.` : '',
    `Prices in ${t.dest.currency}.`,
  ].filter(Boolean).join('\n')
}

const FIELDS = `Each place is one JSON object on its own line (JSON Lines, no array, no prose, no code fences):
{"name":"","kind":"sight|museum|outdoors|tour|kids|meal|snack|show|shop|other","lat":0,"lng":0,"badge":"must|worth|depends|trap|gem","must":true,"worth":0-10,"value":0-10,"sub":{"iconic":0-10,"vibe":0-10,"hassle":0-10,"kid":0-10},"rec":"pay|cheaper|skip","recText":"one sentence, max 90 chars","desc":"2-3 sentences, max 320 chars, written for THIS group: what it is, what each age will enjoy or find hard (name ages, e.g. the 8-year-old), and how to do it with them","why":"max 70 chars","tip":"max 100 chars","price":adult price per person in local currency (0 if free),"minutes":time to spend there with this family,"indoor":true|false,"hours":["Sun","Mon","Tue","Wed","Thu","Fri","Sat" each as "HH:MM-HH:MM" or "closed"],"wiki":"exact English Wikipedia article title about this exact place, or null"}
Rules: "hassle" is LOW hassle (10 = easy). "value" = worth per money compared with similar options. "must" only for the true can't-miss sights (6 to 10 of them). Never mark a must-see "skip". Be honest about tourist traps. "meal" = sit-down lunch/dinner places near the main sights; "snack" = bakeries, ice cream, quick bites. Kinds: "sight" = landmarks, monuments, viewpoints, neighbourhoods; "outdoors" = parks, gardens, beaches, hikes, nature; "tour" = guided tours, boat trips, snorkeling, classes, excursions; "kids" = zoos, aquariums, theme and water parks, playgrounds; "show" = performances, concerts, nightlife; "shop" = shops and markets.`

interface RawPlace { name: string; kind: Kind; lat: number; lng: number; badge: Badge; must: boolean; worth: number; value: number; sub: Place['sub']; rec: Place['rec']; recText: string; desc?: string; why: string; tip: string; price: number; minutes: number; indoor: boolean; hours?: string[]; wiki?: string | null }

const KINDS: Kind[] = ['sight', 'museum', 'outdoors', 'tour', 'kids', 'meal', 'snack', 'show', 'shop', 'other']
const clamp = (n: unknown, lo = 0, hi = 10) => Math.min(hi, Math.max(lo, Number(n) || 0))

function parseHours(h?: string[]): Hours | undefined {
  if (!Array.isArray(h) || h.length !== 7) return undefined
  const week = h.map((d) => {
    if (!d || /closed/i.test(d)) return null
    const [a, b] = d.split('-').map((x) => parseClock(x))
    if (a == null || b == null) return null
    return [a, b <= a ? 1440 : b] as [number, number]
  })
  return { week, source: 'ai' }
}

export function toPlace(raw: RawPlace, trip: Trip, rank: string): Place | null {
  if (!raw || typeof raw.name !== 'string' || !isFinite(raw.lat) || !isFinite(raw.lng)) return null
  const minutes = Math.round(clamp(raw.minutes, 15, 480) / 15) * 15
  return {
    id: crypto.randomUUID(), trip: trip.id, name: raw.name.slice(0, 80),
    kind: KINDS.includes(raw.kind) ? raw.kind : 'sight', lat: +raw.lat, lng: +raw.lng,
    badge: (['must', 'worth', 'depends', 'trap', 'gem'] as Badge[]).includes(raw.badge) ? raw.badge : 'worth',
    must: !!raw.must && raw.badge !== 'trap', value: clamp(raw.value), scoreV: 2,
    sub: { iconic: clamp(raw.sub?.iconic), vibe: clamp(raw.sub?.vibe), hassle: clamp(raw.sub?.hassle), kid: clamp(raw.sub?.kid) },
    worth: worthOf({ value: clamp(raw.value), sub: { iconic: clamp(raw.sub?.iconic), vibe: clamp(raw.sub?.vibe), hassle: clamp(raw.sub?.hassle), kid: clamp(raw.sub?.kid) } }, hasKids(trip)),
    desc: raw.desc ? String(raw.desc).slice(0, 420) : undefined, descFor: raw.desc ? groupKey(trip) : undefined,
    rec: raw.must && raw.rec === 'skip' ? 'cheaper' : (['pay', 'cheaper', 'skip'] as const).includes(raw.rec) ? raw.rec : 'pay',
    recText: String(raw.recText ?? '').slice(0, 140), why: String(raw.why ?? '').slice(0, 120), tip: String(raw.tip ?? '').slice(0, 160),
    price: Math.max(0, Number(raw.price) || 0), minutes, suggested: minutes, indoor: !!raw.indoor,
    wiki: typeof raw.wiki === 'string' && raw.wiki.trim() ? raw.wiki.trim().slice(0, 120) : null,
    hours: parseHours(raw.hours), status: raw.badge === 'trap' ? 'out' : raw.must ? 'picked' : 'maybe', rank, day: null, at: Date.now(),
  }
}

/** What Google Search is for: the things a generic list misses. */
const SEARCH = `Use Google Search to check what is real, open and happening on these exact dates. Include time-sensitive and seasonal experiences (wildlife such as sea-turtle hatchling releases or whale watching, festivals, night markets, sports, local events) and small local things near where they're staying that guidebooks miss. Only places that operate now, with accurate coordinates. Output only the JSON lines.`

/** Streams JSON-lines places from a prompt, searching Google first; without search if that fails. */
async function streamPlaces(prompt: string, trip: Trip, onRaw: (raw: RawPlace) => void, maxOutputTokens = 12000): Promise<number> {
  let count = 0
  const run = (grounded: boolean) => useModel((key, model) => {
    let seen = 0
    count = 0
    const take = (line: string) => { const raw = jsonIn<RawPlace>(line, 'object'); if (raw && typeof raw.name === 'string') { count++; onRaw(raw) } }
    const body = { contents: [{ role: 'user', parts: [{ text: grounded ? `${prompt}\n${SEARCH}` : prompt }] }], ...(grounded ? { tools: [{ google_search: {} }] } : {}), generationConfig: { temperature: 0.4, maxOutputTokens } }
    return stream(key, model, body, (all) => {
      const lines = all.split('\n')
      for (; seen < lines.length - 1; seen++) take(lines[seen])
    }, { stallMs: grounded ? 60000 : 25000 }).then((all) => { take(all.split('\n').at(-1) ?? '') })
  })
  try { await run(true) } catch (e) { if (count) throw e; await run(false) }
  if (!count) throw new AiError('Gemini did not return any places. Try again.', 0, true)
  void trip
  return count
}

/** "Find more": up to 8 new places for one focus (near us, on our dates, nature…), searching Google. */
export async function discover(trip: Trip, focus: string, near: { lat: number; lng: number } | undefined, names: string[], onPlace: (p: Place) => void): Promise<number> {
  const prompt = `You are a family travel expert who knows this place like a local. Find up to 8 NEW places or experiences for this trip: ${focus}.${near ? ` They are at ${near.lat.toFixed(4)}, ${near.lng.toFixed(4)} right now.` : ''}\n${tripBrief(trip)}\n${FIELDS}\nAlready in their list (don't repeat): ${names.join('; ')}`
  let rank: string | undefined
  return streamPlaces(prompt, trip, (raw) => { rank = between(rank, undefined); const p = toPlace(raw, trip, rank); if (p) onPlace(p) }, 6000)
}

/** Builds the list, streaming: `onPlace` gets each place as soon as its line arrives. */
export async function buildList(trip: Trip, onPlace: (p: Place) => void): Promise<number> {
  const prompt = `You are a family travel expert who knows this place like a local. Suggest 32 places and experiences for this trip.\n${tripBrief(trip)}\n${FIELDS}\nMix: the must-sees, worth-it sights for these vibes, 3-4 hidden gems and local experiences near where they're staying, anything seasonal or special on their dates, 4-5 meal spots, 3 snacks, and 1-2 famous tourist traps marked "trap".`
  let rank: string | undefined
  let count = 0
  await streamPlaces(prompt, trip, (raw) => { rank = between(rank, undefined); const p = toPlace(raw, trip, rank); if (p) { count++; onPlace(p) } })
  return count
}

/** Scores one place typed by hand. */
export async function scorePlace(trip: Trip, name: string, rank: string): Promise<Place | null> {
  const prompt = `You are a family travel expert. Score this one place for the trip below.\nPlace: ${name}\n${tripBrief(trip)}\n${FIELDS}\nReturn exactly one line.`
  const j = await useModel((key, model) => generate(key, model, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }))
  const raw = jsonIn<RawPlace>(answerText(j), 'object')
  return raw ? toPlace(raw, trip, rank) : null
}

/** A longer description for a place saved before descriptions existed (once, when its card opens). */
export async function describePlace(trip: Trip, p: Place): Promise<string> {
  const prompt = `In 2-3 sentences (max 320 characters, plain text), describe ${p.name} in ${trip.dest.name} for this group: ${groupLine(trip)}. Say what it is, what each age will enjoy or find hard (name the ages, e.g. "the 8-year-old"), and how to do it with them.\n${tripBrief(trip)}`
  const j = await useModel((key, model) => generate(key, model, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 300 } }))
  return answerText(j).trim().slice(0, 420)
}

/** What the suggestions depend on: changing any of it re-scores the list. */
export const listKey = (t: Trip) => JSON.stringify([t.vibes, t.budget, groupKey(t), t.pace, t.food.trim(), t.nos])

/**
 * The trip settings changed: re-score every place in the list for the new settings and suggest
 * up to 8 new ones that fit better. Streams; `onPlace` gets each line (old names kept exactly).
 */
export async function rescoreList(trip: Trip, names: string[], onPlace: (raw: Place) => void): Promise<number> {
  const prompt = `You are a family travel expert. This family changed their trip settings. Re-score every place in their list below for the trip as it is now (same exact name for each), then suggest up to 8 NEW places that fit these settings better and are not in the list.\n${tripBrief(trip)}\n${FIELDS}\nTheir list:\n${names.map((n) => `- ${n}`).join('\n')}`
  let count = 0
  await useModel((key, model) => {
    let seen = 0
    count = 0
    const take = (line: string) => { const raw = jsonIn<RawPlace>(line, 'object'); const p = raw && toPlace(raw, trip, ''); if (p) { count++; onPlace(p) } }
    return stream(key, model, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 16000 } }, (all) => {
      const lines = all.split('\n')
      for (; seen < lines.length - 1; seen++) take(lines[seen])
    }).then((all) => { take(all.split('\n').at(-1) ?? '') })
  })
  return count
}

/** Ask: streams the answer; a final "ACTION {…}" line proposes a change the app can apply. */
export interface AskAction { type: 'move'; place: string; day: number | null; time?: string }
export async function ask(context: string, question: string, onText: (visible: string) => void): Promise<{ text: string; action?: AskAction }> {
  const prompt = `You are a concise family travel sidekick on this trip. Answer in 2-5 short sentences, plain text, no markdown.
If (and only if) a change to the plan would help, end with one extra line exactly like:
ACTION {"type":"move","place":"<exact place name>","day":<day number or null to unschedule>,"time":"HH:MM" (optional)}
${context}
Question: ${question}`
  const all = await useModel((key, model) => stream(key, model, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 900 } }, (t) => onText(t.split('\nACTION')[0].replace(/ACTION\s*\{[\s\S]*$/, '').trim())))
  const m = /ACTION\s*(\{[\s\S]*\})\s*$/.exec(all)
  let action: AskAction | undefined
  if (m) { try { const a = JSON.parse(m[1]); if (a?.type === 'move' && typeof a.place === 'string') action = a } catch { /* ignore */ } }
  return { text: all.split(/\n?ACTION\s*\{/)[0].trim(), action }
}

/** Checks opening hours with Google Search for these places on these dates. */
export async function checkHours(trip: Trip, items: { place: Place; date: string }[]): Promise<Map<string, [number, number] | null>> {
  const lines = items.map((i, n) => `${n + 1}. ${i.place.name}, ${trip.dest.name} — ${WEEKDAY[new Date(i.date + 'T12:00:00Z').getUTCDay()]} ${i.date}`)
  const prompt = `Using Google Search, give the opening hours for each place on the given date (check holidays and special closures).\n${lines.join('\n')}\nReply with only a JSON array, one object per line number: [{"n":1,"open":"HH:MM","close":"HH:MM","closed":false}]`
  const j = await useModel((key, model) => generate(key, model, { contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }, { timeoutMs: 60000 }))
  const arr = jsonIn<{ n: number; open?: string; close?: string; closed?: boolean }[]>(answerText(j)) ?? []
  const out = new Map<string, [number, number] | null>()
  for (const r of arr) {
    const it = items[r.n - 1]
    if (!it) continue
    if (r.closed) { out.set(it.place.id + '|' + it.date, null); continue }
    const a = parseClock(r.open ?? ''), b = parseClock(r.close ?? '')
    if (a != null && b != null) out.set(it.place.id + '|' + it.date, [a, b <= a ? 1440 : b])
  }
  return out
}

/** Local rules for the Trip tab: closing days, tipping, scams, transport. Made once per trip. */
export async function localRules(trip: Trip): Promise<{ title: string; text: string }[]> {
  const prompt = `Local rules a family visiting ${trip.dest.name} (${trip.start} to ${trip.end}) should know. 4 to 6 items: closing days, tipping, common scams, public transport, anything unusual. Reply with only a JSON array: [{"title":"max 3 words","text":"max 140 chars"}]`
  const j = await useModel((key, model) => generate(key, model, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } }))
  return (jsonIn<{ title: string; text: string }[]>(answerText(j)) ?? []).slice(0, 6)
}

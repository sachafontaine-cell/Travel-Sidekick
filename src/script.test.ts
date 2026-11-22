// Runs the Google script (script/Code.gs) against fake Google services: sheet, properties,
// lock, mail, Gemini and the Apps Script API. Catches mistakes before they reach the family.
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('../script/Code.gs', import.meta.url), 'utf8')

function world(fetchImpl: (url: string, opts: any) => { code: number; body: string } = () => ({ code: 404, body: '' })) {
  const props: Record<string, string> = { KEY: 'family-key-123', SHEET_ID: 'sheet1' }
  const tabs: Record<string, any[][]> = { records: [['key', 'coll', 'at', 'serverAt', 'data']] }
  const mails: any[] = []
  const fetched: { url: string; opts: any }[] = []
  const sheetOf = (name: string) => {
    const rows = () => (tabs[name] ??= [])
    return {
      getLastRow: () => rows().length,
      appendRow: (r: any[]) => rows().push(r),
      getRange: (r: number, c: number, n = 1, w = 1) => ({
        getValues: () => rows().slice(r - 1, r - 1 + n).map((x) => x.slice(c - 1, c - 1 + w)),
        setValues: (v: any[][]) => { const all = rows(); v.forEach((row, i) => { all[r - 1 + i] = [...(all[r - 1 + i] ?? []).slice(0, c - 1), ...row] }) },
        setValue: (v: any) => { const all = rows(); (all[r - 1] ??= [])[c - 1] = v },
      }),
    }
  }
  let clock = 1_800_000_000_000
  const ctx: any = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => { if (v.length > 9000) throw new Error('Property too big'); props[k] = v }, deleteProperty: (k: string) => { delete props[k] } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n: string) => (tabs[n] ? sheetOf(n) : null), insertSheet: (n: string) => { tabs[n] = []; return sheetOf(n) } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }) },
    MailApp: { sendEmail: (m: any) => mails.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Utilities: { sleep() {}, getUuid: (() => { let n = 0; return () => 'uuid-' + ++n })(), formatDate: (d: Date, _tz: string, f: string) => (f === 'H' ? '7' : '2026-06-14') },
    UrlFetchApp: { fetch: (url: string, opts: any = {}) => { fetched.push({ url, opts }); const r = fetchImpl(url, opts); return { getResponseCode: () => r.code, getContentText: () => r.body } } },
    ScriptApp: (() => {
      const trig: string[] = []
      const chain = (fn: string) => ({ timeBased: () => ({ after: () => ({ create: () => trig.push(fn) }), everyHours: () => ({ create: () => trig.push(fn) }), atHour: () => ({ everyDays: () => ({ create: () => trig.push(fn) }) }) }) })
      return { getScriptId: () => 'script1', getOAuthToken: () => 'tok', triggers: trig, getProjectTriggers: () => trig.map((f) => ({ getHandlerFunction: () => f })), newTrigger: chain, deleteTrigger: (t: any) => { const i = trig.indexOf(t.getHandlerFunction()); if (i >= 0) trig.splice(i, 1) } }
    })(),
    CacheService: { getScriptCache: () => { const m: Record<string, string> = {}; return { get: (k: string) => m[k] ?? null, put: (k: string, v: string) => { m[k] = v } } } },
    Maps: {
      newGeocoder: () => ({ geocode: () => ({ status: 'OK', results: [{ geometry: { location: { lat: 48.86, lng: 2.33 } } }] }) }),
      // Directions: walking 1 km = 14 min; transit has no timetable at the trip date (only now); driving has traffic.
      DirectionFinder: { Mode: { WALKING: 'walking', TRANSIT: 'transit', DRIVING: 'driving' } },
      newDirectionFinder: () => { const q: any = {}; const f: any = { setOrigin: () => f, setDestination: () => f, setMode: (m: string) => { q.mode = m; return f }, setDepart: (d: Date) => { q.depart = d; return f },
        getDirections: () => q.mode === 'transit' && q.depart ? { routes: [] } : { routes: [{ legs: [{ distance: { value: q.mode === 'walking' ? 1000 : 1400 }, duration: { value: q.mode === 'walking' ? 840 : q.mode === 'transit' ? 720 : 300 }, ...(q.mode === 'driving' && q.depart ? { duration_in_traffic: { value: 600 } } : {}) }] }] } }; return f },
    },
    GmailApp: { search: () => [] },
    console,
  }
  vm.createContext(ctx)
  vm.runInContext(code, ctx)
  const tick = () => { clock += 1000; return clock }
  ctx.Date = class extends Date { constructor(...a: any[]) { super(...(a.length ? a : [clock])) } static now() { return clock } }
  vm.runInContext('Date = this.Date', ctx)
  const post = (body: object) => ctx.doPost({ postData: { contents: JSON.stringify(body) } })
  return { ctx, post, props, mails, fetched, tabs, tick }
}

describe('family script', () => {
  let w: ReturnType<typeof world>
  beforeEach(() => { w = world() })

  it('gives real Google Maps times from the hotel: traffic for driving, transit falls back to now', () => {
    const r = w.post({ k: 'family-key-123', op: 'routes', from: { lat: 1, lng: 2 }, depart: Date.now() + 86400000, to: [{ id: 'p1', lat: 1.01, lng: 2 }] })
    expect(r.routes.p1).toMatchObject({ walk: 14, transit: 12, car: 10, km: 1.4, walkKm: 1 })
  })

  it('refuses a wrong family key', () => {
    expect(w.post({ k: 'nope', op: 'sync' })).toEqual({ error: 'Wrong family key' })
  })

  it('syncs: newest change wins, and each phone gets what changed since its last sync', () => {
    const a = w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [{ coll: 'place', id: 'p1', at: 100, data: { id: 'p1', name: 'Louvre' } }] })
    expect(a.recs).toHaveLength(1)
    w.tick()
    // An older edit from the other phone does not overwrite the newer one.
    const b = w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [{ coll: 'place', id: 'p1', at: 50, data: { id: 'p1', name: 'Old' } }] })
    expect(b.recs.find((r: any) => r.id === 'p1').data.name).toBe('Louvre')
    w.tick()
    const c = w.post({ k: 'family-key-123', op: 'sync', since: a.now, put: [{ coll: 'place', id: 'p2', at: 200, data: { id: 'p2' } }] })
    expect(c.recs.map((r: any) => r.id)).toEqual(['p2'])
    expect(c.v).toBe(6)
  })

  it('shares the Gemini key with the other phone', () => {
    w.post({ k: 'family-key-123', op: 'setKey', gk: ' AIza-test ' })
    expect(w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [], wantKey: true }).gk).toBe('AIza-test')
    expect(w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [] }).gk).toBeUndefined()
  })

  it('cleans booking emails before Gemini sees them', () => {
    const r = w.ctx.redact('Card 4111 1111 1111 1111, passport X1234567, ref 123456789, mail a.b@c.com, call +33 1 23 45 67 89. Louvre 9:30')
    expect(r).not.toMatch(/4111|X1234567|123456789|a\.b@c|23 45/)
    expect(r).toContain('Louvre 9:30')
  })

  it('checks must-see hours at 7:00 and emails once when one is closed on its day', () => {
    w = world((url) => url.includes('generativelanguage') ? { code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"n":1,"closed":true},{"n":2,"open":"09:00","close":"18:00"}]' }] } }] }) } : { code: 404, body: '' })
    w.post({ k: 'family-key-123', op: 'setKey', gk: 'AIza' })
    w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [
      { coll: 'trip', id: 't1', at: 1, data: { id: 't1', name: 'Paris', start: '2026-06-12', end: '2026-06-18', dest: { name: 'Paris, France', tz: 'Europe/Paris', lang: 'fr' } } },
      { coll: 'place', id: 'o', at: 1, data: { id: 'o', trip: 't1', name: "Musée d'Orsay", must: true, status: 'picked', day: 3 } },
      { coll: 'place', id: 'e', at: 1, data: { id: 'e', trip: 't1', name: 'Eiffel Tower', must: true, status: 'picked', day: 4 } },
    ] })
    w.tick()
    w.ctx.hourly()
    w.ctx.hourly()
    expect(w.mails).toHaveLength(1)
    expect(w.mails[0].subject).toBe("Musée d'Orsay is closed on Day 3")
    const recs = w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [] }).recs
    const eiffel = recs.find((r: any) => r.id === 'e').data
    expect(eiffel.hours.dates['2026-06-15']).toEqual([540, 1080])
    expect(eiffel.hours.source).toBe('google')
  })

  it('updates itself from the repository and keeps the same web address', () => {
    const calls: string[] = []
    w = world((url, opts) => {
      calls.push(`${(opts.method ?? 'get').toUpperCase()} ${url.replace(/^https:\/\/[^/]+/, '')}`)
      if (url.endsWith('version.json')) return { code: 200, body: '{"version":99}' }
      if (url.endsWith('Code.gs')) return { code: 200, body: 'var VERSION = 99\n' }
      if (url.endsWith('appsscript.json')) return { code: 200, body: '{}' }
      if (url.endsWith('/deployments') && !opts.method?.match(/put/)) return { code: 200, body: JSON.stringify({ deployments: [{ deploymentId: 'HEAD', deploymentConfig: {} }, { deploymentId: 'web1', deploymentConfig: { versionNumber: 1 }, entryPoints: [{ entryPointType: 'WEB_APP' }] }] }) }
      if (url.endsWith('/versions')) return { code: 200, body: '{"versionNumber":7}' }
      return { code: 200, body: '{}' }
    })
    expect(w.post({ k: 'family-key-123', op: 'update' })).toEqual({ ok: true, v: 99 })
    expect(calls).toContain('PUT /v1/projects/script1/content')
    expect(calls).toContain('PUT /v1/projects/script1/deployments/web1')
    expect(w.props.DEPLOYMENT_ID).toBe('web1')
  })

  it('reads booking emails in the background: bookings join their trip, new dates are only suggested, each email once', () => {
    let geminiCalls = 0
    let prompt = ''
    w = world((url, opts) => {
      if (url.includes('generativelanguage')) {
        geminiCalls++
        prompt = JSON.parse(opts.payload).contents[0].parts[0].text
        return { code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([
          { trip: null, destination: 'Cabo San Lucas, Mexico', start: '2026-11-21', end: '2026-11-26', bookings: [
            { name: 'Hotel Riu Santa Fe', kind: 'hotel', date: '2026-11-21', time: '', address: 'Cabo San Lucas' },
            { name: 'Whale watching tour', kind: 'ticket', date: '2026-11-23', time: '09:30', address: 'Marina Cabo San Lucas' }] },
          { trip: null, destination: 'Rome, Italy', start: '2027-03-10', end: '2027-03-16', bookings: [{ name: 'Flight to Rome', kind: 'flight', date: '2027-03-10', time: '18:05', address: 'FCO airport' }] },
        ]) }] } }] }) }
      }
      if (url.includes('geocoding-api.open-meteo.com')) return { code: 200, body: JSON.stringify({ results: [{ name: 'Rome', latitude: 41.89, longitude: 12.48, timezone: 'Europe/Rome', country_code: 'IT', country: 'Italy' }] }) }
      return { code: 404, body: '' }
    })
    const thread = (id: string, body: string) => ({ getId: () => id, msg: { getPlainBody: () => body, getSubject: () => 'Your booking', getDate: () => new Date() } })
    const threads = [thread('t1', 'Riu Santa Fe, card 4111 1111 1111 1111'), thread('t2', 'Whale watching 9:30'), thread('t3', 'Flight to Rome')]
    w.ctx.GmailApp.search = () => threads
    w.ctx.GmailApp.getMessagesForThreads = (ts: any[]) => ts.map((t) => [t.msg])
    w.post({ k: 'family-key-123', op: 'setKey', gk: 'AIza' })
    // The family already made the Cabo trip by hand.
    w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [{ coll: 'trip', id: 'cabo', at: 1, data: { id: 'cabo', name: 'San José del Cabo', start: '2026-11-21', end: '2026-11-26', dest: { name: 'San José del Cabo, Mexico', tz: 'America/Mazatlan', lang: 'es' }, people: [] } }] })
    // Asking for a check never makes the phone wait: it's scheduled.
    expect(w.post({ k: 'family-key-123', op: 'scan' })).toEqual({ ok: true })
    expect(w.ctx.ScriptApp.triggers).toContain('scanNow')
    w.tick()
    w.ctx.scanNow()
    expect(prompt).not.toContain('4111')
    expect(prompt).toContain('"id":"cabo"')
    const res = w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [] })
    const trips = res.recs.filter((r: any) => r.coll === 'trip').map((r: any) => r.data)
    const places = res.recs.filter((r: any) => r.coll === 'place').map((r: any) => r.data)
    const cabo = trips.find((t: any) => t.id === 'cabo')
    expect(cabo.base).toMatchObject({ name: 'Hotel Riu Santa Fe', lat: 48.86 })
    expect(places.find((p: any) => p.name === 'Whale watching tour')).toMatchObject({ trip: 'cabo', day: 3, fixed: 570, booked: 'Booked · from your email' })
    // Rome is not added: it's suggested, with its bookings located, until Add or Not this one.
    expect(trips.find((t: any) => t.name === 'Rome')).toBeUndefined()
    expect(places.find((p: any) => p.name === 'Flight to Rome')).toBeUndefined()
    expect(res.found).toHaveLength(1)
    expect(res.found[0]).toMatchObject({ destination: 'Rome, Italy', start: '2027-03-10', dest: { tz: 'Europe/Rome', country: 'IT' } })
    expect(res.found[0].bookings[0]).toMatchObject({ name: 'Flight to Rome', time: '18:05', lat: 48.86 })
    expect(res.scan).toMatchObject({ added: 1, trips: 1 })
    w.post({ k: 'family-key-123', op: 'dismiss', id: res.found[0].id })
    expect(w.post({ k: 'family-key-123', op: 'sync', since: 0, put: [] }).found).toEqual([])
    // Next hour: the same emails aren't read again (remembered in the Sheet, which has no 9 KB limit).
    w.tick()
    w.ctx.scan()
    expect(geminiCalls).toBe(1)
    expect(JSON.parse(w.tabs.state.find((r: any[]) => r[0] === 'SEEN')[1])).toEqual(['t1', 't2', 't3'])
    expect(w.props.SEEN).toBeUndefined()
  })
})

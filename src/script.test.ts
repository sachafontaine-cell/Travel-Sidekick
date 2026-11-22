// Runs the Google script (script/Code.gs) against fake Google services: sheet, properties,
// lock, mail, Gemini and the Apps Script API. Catches mistakes before they reach the family.
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('../script/Code.gs', import.meta.url), 'utf8')

function world(fetchImpl: (url: string, opts: any) => { code: number; body: string } = () => ({ code: 404, body: '' })) {
  const props: Record<string, string> = { KEY: 'family-key-123', SHEET_ID: 'sheet1' }
  let rows: any[][] = [['key', 'coll', 'at', 'serverAt', 'data']]
  const mails: any[] = []
  const fetched: { url: string; opts: any }[] = []
  const sheet = {
    getLastRow: () => rows.length,
    appendRow: (r: any[]) => rows.push(r),
    getRange: (r: number, c: number, n: number, w: number) => ({
      getValues: () => rows.slice(r - 1, r - 1 + n).map((x) => x.slice(c - 1, c - 1 + w)),
      setValues: (v: any[][]) => { rows = [...rows.slice(0, r - 1), ...v, ...rows.slice(r - 1 + n)] },
    }),
  }
  let clock = 1_800_000_000_000
  const ctx: any = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => { props[k] = v } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }) },
    MailApp: { sendEmail: (m: any) => mails.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Utilities: { sleep() {}, getUuid: () => 'uuid', formatDate: (d: Date, _tz: string, f: string) => (f === 'H' ? '7' : '2026-06-14') },
    UrlFetchApp: { fetch: (url: string, opts: any = {}) => { fetched.push({ url, opts }); const r = fetchImpl(url, opts); return { getResponseCode: () => r.code, getContentText: () => r.body } } },
    ScriptApp: { getScriptId: () => 'script1', getOAuthToken: () => 'tok' },
    Maps: { newGeocoder: () => ({ geocode: () => ({ status: 'OK', results: [{ geometry: { location: { lat: 48.86, lng: 2.33 } } }] }) }) },
    GmailApp: { search: () => [] },
    console,
  }
  vm.createContext(ctx)
  vm.runInContext(code, ctx)
  const tick = () => { clock += 1000; return clock }
  ctx.Date = class extends Date { constructor(...a: any[]) { super(...(a.length ? a : [clock])) } static now() { return clock } }
  vm.runInContext('Date = this.Date', ctx)
  const post = (body: object) => ctx.doPost({ postData: { contents: JSON.stringify(body) } })
  return { ctx, post, props, mails, fetched, rows: () => rows, tick }
}

describe('family script', () => {
  let w: ReturnType<typeof world>
  beforeEach(() => { w = world() })

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
    expect(c.v).toBe(2)
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
      if (url.endsWith('version.json')) return { code: 200, body: '{"version":3}' }
      if (url.endsWith('Code.gs')) return { code: 200, body: 'var VERSION = 3\n' }
      if (url.endsWith('appsscript.json')) return { code: 200, body: '{}' }
      if (url.endsWith('/deployments') && !opts.method?.match(/put/)) return { code: 200, body: JSON.stringify({ deployments: [{ deploymentId: 'HEAD', deploymentConfig: {} }, { deploymentId: 'web1', deploymentConfig: { versionNumber: 1 }, entryPoints: [{ entryPointType: 'WEB_APP' }] }] }) }
      if (url.endsWith('/versions')) return { code: 200, body: '{"versionNumber":7}' }
      return { code: 200, body: '{}' }
    })
    expect(w.post({ k: 'family-key-123', op: 'update' })).toEqual({ ok: true, v: 3 })
    expect(calls).toContain('PUT /v1/projects/script1/content')
    expect(calls).toContain('PUT /v1/projects/script1/deployments/web1')
    expect(w.props.DEPLOYMENT_ID).toBe('web1')
  })

  it('finds trips in booking emails and the KAYAK calendar', () => {
    const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Flight to San Jose del Cabo (SJD)\nDTSTART:20261121T093000\nDTEND:20261121T130000\nLOCATION:SAN\nEND:VEVENT\nEND:VCALENDAR'
    let prompt = ''
    w = world((url, opts) => {
      if (url.startsWith('https://kayak.test')) return { code: 200, body: ics }
      if (url.includes('generativelanguage')) { prompt = JSON.parse(opts.payload).contents[0].parts[0].text; return { code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"destination":"Cabo San Lucas, Mexico","start":"2026-11-21","end":"2026-11-26","bookings":[{"name":"Hotel Riu","kind":"hotel","date":"2026-11-21","address":"Cabo"}]},{"destination":"Old","start":"2020-01-01","end":"2020-01-02","bookings":[]}]' }] } }] }) } }
      return { code: 404, body: '' }
    })
    w.ctx.GmailApp.search = () => [{ getMessages: () => [{ getPlainBody: () => 'Your stay at Hotel Riu, card 4111 1111 1111 1111', getSubject: () => 'Confirmation', getDate: () => new Date() }] }]
    w.post({ k: 'family-key-123', op: 'setKey', gk: 'AIza' })
    expect(w.post({ k: 'family-key-123', op: 'setKayak', url: 'webcal://nope' })).toEqual({ ok: true })
    w.props.KAYAK_ICS = 'https://kayak.test/ical/abc'
    const r = w.post({ k: 'family-key-123', op: 'trips' })
    expect(r.trips.map((t: any) => t.destination)).toEqual(['Cabo San Lucas, Mexico'])
    expect(r.trips[0].bookings[0]).toMatchObject({ name: 'Hotel Riu', kind: 'hotel', lat: 48.86 })
    expect(prompt).toContain('Flight to San Jose del Cabo')
    expect(prompt).not.toContain('4111')
  })
})

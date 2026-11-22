// End-to-end tests on a phone-sized browser: the sample trip, a whole new trip (Gemini and map
// services faked), offline start, dark mode, and the speed budgets on a slowed-down CPU.
// Run: npm run e2e   (builds first). Needs Playwright's Chromium.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const BASE = 'http://localhost:4321/Travel-Sidekick/'
const SHOTS = 'tests/e2e/shots'
mkdirSync(SHOTS, { recursive: true })
const results = []
async function test(name, fn) {
  const t0 = Date.now()
  try { await fn(); results.push(['PASS', name, Date.now() - t0]) } catch (e) { if (process.env.STACK) console.log(e.stack); results.push(['FAIL', name, e.message.split('\n')[0]]) }
}
const expect = (ok, msg) => { if (!ok) throw new Error(msg) }

const srv = await serve()
const browser = await chromium.launch()
const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, geolocation: { latitude: 48.8625, longitude: 2.3353 }, permissions: ['geolocation'] }

async function page(opts = {}) {
  const ctx = await browser.newContext({ ...PHONE, serviceWorkers: 'block', ...opts })
  const p = await ctx.newPage()
  p.errors = []
  p.on('pageerror', (e) => p.errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()) })
  // Wikipedia is faked: by default it knows nothing (tests that need photos set their own).
  await p.route(/wikipedia\.org|wikidata\.org|wikimedia\.org/, (r) => r.fulfill({ json: { query: { geosearch: [] } } }))
  return p
}
const text = (p) => p.evaluate(() => document.body.innerText)
// The app writes to storage when idle (within 0.5 s): wait for that before reading it.
const storedPlaces = async (p) => { await p.waitForTimeout(700); return p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ts:places') || '{}'))) }

// ---------- Sample trip ----------

await test('sample trip: Today shows next up, leave-by, what now, and asks about the Louvre', async () => {
  const p = await page()
  await p.goto(BASE + '?demo')
  await p.getByText('Next up').waitFor()
  const t = await text(p)
  expect(t.includes('Lunch · Le Fumoir'), 'next up is lunch')
  expect(/Leave by \d/.test(t), 'leave-by shown')
  expect(t.includes('What now?') && t.includes('Tuileries Garden'), 'what now suggests the Tuileries')
  expect(t.includes('Louvre (highlights tour): done?'), 'asks if the Louvre is done')
  await p.getByRole('button', { name: 'Yes' }).click()
  await p.getByText('Must-sees 5 of 9').waitFor()
  // Every trip screen has a way back to all trips, and to ⚙.
  await p.getByRole('button', { name: 'This app: key, family link, alerts' }).click()
  await p.getByRole('dialog', { name: 'This app' }).waitFor()
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'All trips' }).click()
  await p.getByRole('heading', { name: 'Trips' }).waitFor()
  await p.goBack()
  await p.getByText('Next up').waitFor()
  expect(p.errors.length === 0, 'no console errors: ' + p.errors.join(' | '))
  await p.screenshot({ path: `${SHOTS}/today.png` })
  await p.context().close()
})

await test('sample trip: Rebalance moves Orsay to an open day; Undo restores it', async () => {
  const p = await page()
  await p.goto(BASE + '?demo#/t/demo-paris/plan')
  await p.getByRole('button', { name: /Fix it/ }).click()
  await p.getByRole('button', { name: /Apply 1 change/ }).click()
  await p.getByText("Moved Musée d'Orsay").waitFor()
  const day = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ts-demo:places') || '{}')).find((x) => x.name === "Musée d'Orsay")?.day)
  expect(day && day !== 4 && day > 3, `Orsay on an open later day (got ${day})`)
  await p.getByRole('button', { name: 'Undo' }).click()
  await p.waitForTimeout(200)
  const back = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ts-demo:places') || '{}')).find((x) => x.name === "Musée d'Orsay")?.day)
  expect(back == null, 'Undo takes it off the day again')
  await p.context().close()
})

await test('sample trip: the Card is a dialog; X and a tap outside close it; the star toggles must-see', async () => {
  const p = await page()
  await p.goto(BASE + '?demo#/t/demo-paris/plan/4')
  await p.locator('.slot .open', { hasText: 'Eiffel Tower' }).click()
  const dlg = p.getByRole('dialog', { name: 'Eiffel Tower' })
  await dlg.waitFor()
  expect((await dlg.innerText()).includes('Check hours'), 'hours line with Check hours')
  await p.screenshot({ path: `${SHOTS}/card.png` })
  await dlg.getByRole('button', { name: 'Must-see' }).click()
  await dlg.getByRole('button', { name: 'Make must-see' }).waitFor()
  await p.getByRole('button', { name: 'Undo' }).click()
  await dlg.getByRole('button', { name: 'Must-see' }).waitFor()
  await dlg.getByRole('button', { name: 'Close' }).click()
  await dlg.waitFor({ state: 'detached' })
  await p.locator('.slot .open', { hasText: 'Eiffel Tower' }).click()
  await p.getByRole('dialog').waitFor()
  await p.mouse.click(206, 905) // the dimmed area below the dialog
  await p.getByRole('dialog').waitFor({ state: 'detached' })
  await p.context().close()
})

await test('sample trip: drag reorders the list; swipe skips (with Undo)', async () => {
  const p = await page()
  await p.goto(BASE + '?demo#/t/demo-paris/plan')
  const names = () => p.locator('.section').first().locator('.prow .name').allInnerTexts()
  const before = await names()
  await p.evaluate(() => document.querySelector('.main').scrollBy(0, 400))
  await p.waitForTimeout(150)
  const h = await p.getByRole('button', { name: `Drag to reorder ${before[0]}` }).boundingBox()
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await p.mouse.down()
  for (let i = 1; i <= 20; i++) await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + i * 12)
  await p.mouse.up()
  await p.waitForTimeout(200)
  const after = await names()
  expect(after[0] !== before[0] && after.includes(before[0]), `first row moved down (${after.slice(0, 3)})`)
  const maybe = p.locator('.section').first().locator('.prow').filter({ hasNot: p.locator('.chip.star') }).nth(1)
  await maybe.scrollIntoViewIfNeeded()
  const name = await maybe.locator('.name').innerText()
  const b = await maybe.boundingBox()
  await p.mouse.move(b.x + 200, b.y + b.height / 2)
  await p.mouse.down()
  for (let i = 1; i <= 10; i++) await p.mouse.move(b.x + 200 - i * 15, b.y + b.height / 2)
  await p.mouse.up()
  await p.getByText(`${name} skipped`).waitFor()
  await p.getByRole('button', { name: 'Undo' }).click()
  await p.waitForTimeout(150)
  expect((await p.locator('.section').first().locator('.prow .name').allInnerTexts()).includes(name), 'Undo brings it back')
  await p.context().close()
})

await test('sample trip: checklist + Plan my days; Card Want it · Maybe · Skip; Add to this day', async () => {
  const p = await page()
  await p.goto(BASE + '?demo#/t/demo-paris/plan')
  const box = p.locator('.prow [role=checkbox][aria-checked=false]').first()
  const name = await box.getAttribute('aria-label')
  await box.click()
  expect(await p.getByRole('checkbox', { name, exact: true }).getAttribute('aria-checked') === 'true', 'the box is checked')
  await p.getByRole('button', { name: 'Plan my days' }).click()
  await p.getByText(/^Days planned/).waitFor()
  const row = p.locator('.prow', { has: p.getByRole('checkbox', { name, exact: true }) })
  expect(/Day \d|Doesn't fit/.test(await row.innerText()), 'the checked place got a day (or says it doesn\'t fit)')
  await row.locator('.open').click()
  const seg = p.getByRole('group', { name: 'In the plan' })
  await seg.getByRole('button', { name: 'Skip' }).click()
  await p.getByText(`${name} skipped`).waitFor()
  expect(await seg.getByRole('button', { name: 'Skip' }).getAttribute('aria-pressed') === 'true', 'Card shows Skip on')
  await seg.getByRole('button', { name: 'Maybe' }).click()
  await p.keyboard.press('Escape')
  await p.goto(BASE + '?demo#/t/demo-paris/plan/5')
  const count = await p.locator('.slot').count()
  await p.getByRole('button', { name: 'Add to this day' }).click()
  const sheet = p.getByRole('dialog', { name: 'Add to Day 5' })
  await sheet.locator('.kv').first().click()
  await sheet.getByText('Added').waitFor()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await p.waitForTimeout(150)
  expect(await p.locator('.slot').count() > count, 'the day has one more stop')
  expect(p.errors.length === 0, 'no console errors: ' + p.errors.join(' | '))
  await p.context().close()
})

await test('sample trip: set your own start time on the Card; Auto gives it back to the planner', async () => {
  const p = await page()
  await p.goto(BASE + '?demo#/t/demo-paris/plan/4')
  await p.locator('.slot .open', { hasText: 'Eiffel Tower' }).click()
  const t = p.getByLabel(/Start time/)
  await t.fill('15:00')
  await t.dispatchEvent('change')
  await p.getByText('Eiffel Tower at 15:00').waitFor()
  await p.getByText('Set by you').waitFor()
  await p.keyboard.press('Escape')
  const row = p.locator('.slot', { hasText: 'Eiffel Tower' })
  expect((await row.locator('.t').innerText()).trim() === '15:00', 'the day shows it at 15:00')
  await row.locator('.open').click()
  await p.getByRole('button', { name: 'Auto', exact: true }).click()
  await p.getByText('Set by the planner').waitFor()
  expect(p.errors.length === 0, 'no console errors: ' + p.errors.join(' | '))
  await p.context().close()
})

await test('sample trip: Day view drag moves downtime; Back closes overlays first', async () => {
  const p = await page()
  await p.goto(BASE + '?demo#/t/demo-paris/plan/3')
  const kinds = () => p.locator('.slot .name').allInnerTexts()
  const before = await kinds()
  const di = before.findIndex((x) => x.startsWith('Downtime'))
  const h = await p.getByRole('button', { name: /Drag to move Downtime/ }).boundingBox()
  await p.mouse.move(h.x + 20, h.y + 20); await p.mouse.down()
  for (let i = 1; i <= 10; i++) await p.mouse.move(h.x + 20, h.y + 20 + i * 8)
  await p.mouse.up(); await p.waitForTimeout(200)
  const after = await kinds()
  expect(after.findIndex((x) => x.startsWith('Downtime')) === di + 1, `downtime moved one later (${after})`)
  await p.locator('.slot .open', { hasText: 'Sainte-Chapelle' }).click()
  await p.getByRole('dialog').waitFor()
  await p.goBack()
  await p.getByRole('dialog').waitFor({ state: 'detached' })
  expect(p.url().includes('plan/3'), 'still on Day 3 after Back')
  await p.context().close()
})

await test('photos: the Eiffel Tower card shows its official photo; a restaurant shows none', async () => {
  const p = await page()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  await p.route(/wikipedia\.org\/w\/api\.php.*geosearch/, (r) => r.fulfill({ json: { query: { geosearch: r.request().url().includes('48.8584') ? [{ title: 'Eiffel Tower', dist: 20 }] : [] } } }))
  await p.route(/wikipedia\.org\/api\/rest_v1\/page\/summary/, (r) => r.fulfill({ json: { type: 'standard', title: 'Eiffel Tower', wikibase_item: 'Q243', coordinates: { lat: 48.8583, lon: 2.2944 } } }))
  await p.route(/wikidata\.org/, (r) => r.fulfill({ json: { claims: { P18: [{ mainsnak: { datavalue: { value: 'Tour Eiffel Wikimedia Commons.jpg' } } }] } } }))
  await p.route(/commons\.wikimedia\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }))
  await p.goto(BASE + '?demo#/t/demo-paris/plan/4')
  await p.locator('.slot .open', { hasText: 'Eiffel Tower' }).click()
  await p.locator('.photos img.in').first().waitFor({ timeout: 8000 })
  expect((await p.locator('.photos img').first().getAttribute('src')).includes('Tour_Eiffel_Wikimedia_Commons.jpg'), 'official photo')
  expect((await p.getByRole('dialog').innerText()).includes('Photos on Google Maps'), 'Google Maps photos link')
  await p.keyboard.press('Escape')
  await p.goto(BASE + '?demo#/t/demo-paris/plan/3')
  await p.locator('.slot .open', { hasText: 'Le Fumoir' }).click()
  await p.waitForTimeout(800)
  expect(await p.locator('.photos img').count() === 0, 'no photo for the restaurant')
  await p.context().close()
})

await test('dark mode renders with no errors', async () => {
  const p = await page({ colorScheme: 'dark' })
  await p.goto(BASE + '?demo#/t/demo-paris/plan')
  await p.getByText(/^Activities/).first().waitFor()
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg === 'rgb(14, 23, 41)', 'dark background ' + bg)
  expect(p.errors.length === 0, 'no console errors')
  await p.screenshot({ path: `${SHOTS}/dark-plan.png` })
  await p.context().close()
})

// ---------- A whole new trip, with Gemini and the map services faked ----------

const PLACES = [
  { name: 'Eiffel Tower', kind: 'sight', lat: 48.8584, lng: 2.2945, badge: 'must', must: true, worth: 9.5, value: 7, sub: { iconic: 10, vibe: 8, hassle: 5, kid: 8 }, rec: 'cheaper', recText: 'Level 2 by stairs.', why: 'The view.', tip: 'Book ahead.', price: 27, minutes: 120, indoor: false, hours: Array(7).fill('09:30-23:45') },
  { name: "Musée d'Orsay", kind: 'museum', lat: 48.86, lng: 2.3266, badge: 'must', must: true, worth: 9, value: 8, sub: { iconic: 9, vibe: 9, hassle: 6, kid: 6 }, rec: 'pay', recText: 'Kids free.', why: 'Monet.', tip: '5th floor first.', price: 16, minutes: 120, indoor: true, hours: ['09:30-18:00', 'closed', '09:30-18:00', '09:30-18:00', '09:30-21:45', '09:30-18:00', '09:30-18:00'] },
  { name: 'Louvre', kind: 'museum', lat: 48.8606, lng: 2.3376, badge: 'must', must: true, worth: 9, value: 8, sub: { iconic: 10, vibe: 8, hassle: 4, kid: 7 }, rec: 'pay', recText: 'Kid route.', why: 'Mona Lisa.', tip: 'Carrousel entrance.', price: 22, minutes: 150, indoor: true, hours: ['09:00-18:00', '09:00-18:00', 'closed', '09:00-18:00', '09:00-18:00', '09:00-21:00', '09:00-18:00'] },
  { name: 'Luxembourg Gardens', kind: 'park', lat: 48.8462, lng: 2.3372, badge: 'worth', must: false, worth: 8, value: 10, sub: { iconic: 7, vibe: 9, hassle: 9, kid: 10 }, rec: 'pay', recText: 'Free.', why: 'Sailboats.', tip: 'Puppets.', price: 0, minutes: 90, indoor: false, hours: Array(7).fill('07:30-21:00') },
  { name: 'Bouillon Chartier', kind: 'meal', lat: 48.8719, lng: 2.3436, badge: 'gem', must: false, worth: 8, value: 9, sub: { iconic: 7, vibe: 9, hassle: 7, kid: 8 }, rec: 'pay', recText: 'Cheap classic.', why: '1896 hall.', tip: 'Arrive early.', price: 20, minutes: 75, indoor: true, hours: Array(7).fill('11:30-23:59') },
  { name: 'Seine dinner cruise', kind: 'show', lat: 48.8622, lng: 2.3013, badge: 'trap', must: false, worth: 5, value: 3, sub: { iconic: 6, vibe: 5, hassle: 5, kid: 4 }, rec: 'skip', recText: 'Pricey.', why: 'Same view free.', tip: 'Walk instead.', price: 85, minutes: 150, indoor: false, hours: Array(7).fill('19:00-23:00') },
]
async function fakeServices(p) {
  await p.route('https://geocoding-api.open-meteo.com/**', (r) => r.fulfill({ json: { results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, timezone: 'Europe/Paris', country_code: 'FR', country: 'France', admin1: 'Île-de-France' }] } }))
  await p.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: { hourly: { time: ['2026-06-12T10:00'], temperature_2m: [70], precipitation_probability: [10] } } }))
  await p.route('https://api.frankfurter.**/**', (r) => r.fulfill({ json: { rates: { USD: 1.1 } } }))
  await p.route('https://generativelanguage.googleapis.com/**', async (r) => {
    const url = r.request().url()
    if (url.includes('/models?')) return r.fulfill({ json: { models: [{ name: 'models/gemini-9.9-flash', supportedGenerationMethods: ['generateContent'] }] } })
    if (url.includes('streamGenerateContent')) {
      // A refresh after the settings changed: the same places re-scored, plus one new fit.
      const post = r.request().postData() ?? ''
      const again = post.includes('changed their trip settings')
      // "Find more" searches Google (grounded) for one focus.
      if (post.includes('Find up to 8 NEW')) expect(post.includes('google_search') && post.includes('turtle release'), 'Find more searches Google for what was typed')
      const list = post.includes('Find up to 8 NEW') ? [{ ...PLACES[3], name: 'Sea turtle hatchling release', kind: 'outdoors', lat: 48.85, lng: 2.35 }] : again ? [...PLACES.map((x) => x.name === 'Luxembourg Gardens' ? { ...x, sub: { ...x.sub, vibe: 2 } } : x), { ...PLACES[3], name: 'Jardin des Plantes', lat: 48.8440, lng: 2.3596 }] : PLACES
      const lines = list.map((x) => JSON.stringify(x)).join('\n')
      const chunks = [lines.slice(0, 400), lines.slice(400, 1500), lines.slice(1500)]
      const body = chunks.map((c) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: c }] } }] })}\n\n`).join('')
      return r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body })
    }
    return r.fulfill({ json: { candidates: [{ content: { parts: [{ text: '[]' }] } }] } })
  })
}

await test('new trip: setup, key, build the list (streamed), confirm must-sees, days planned; vibe change re-scores; Find more', async () => {
  const p = await page()
  await fakeServices(p)
  await p.goto(BASE)
  await p.getByRole('button', { name: '+ New trip' }).first().click()
  await p.getByRole('button', { name: /Where & when/ }).click()
  await p.getByPlaceholder(/City/).fill('Paris')
  await p.getByRole('button', { name: /Paris, Île-de-France, France/ }).click()
  await p.getByLabel('Start').fill('2026-06-12')
  await p.getByLabel('End').fill('2026-06-18')
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: /Who's coming/ }).click()
  for (const [name, age] of [['Alex', '47'], ['Mia', '10']]) {
    await p.getByRole('button', { name: /Add person/ }).click()
    await p.getByPlaceholder('Name').last().fill(name)
    await p.getByLabel(/Age of/).last().fill(age)
  }
  expect((await text(p)).includes('Group walking limit: 6 mi'), 'group limit from the 10-year-old')
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: /Vibe/ }).click()
  await p.getByRole('button', { name: 'More Cultural' }).click()
  await p.getByRole('button', { name: 'More Family' }).click()
  await p.getByRole('button', { name: 'Family', exact: true }).click()
  expect((await text(p)).includes('Kid-friendly first'), 'tapping the vibe name explains it')
  expect((await text(p)).includes('Total 100%'), 'vibes total 100%')
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'Build my list' }).click()
  await p.getByRole('button', { name: 'Add the Gemini key' }).click()
  await p.getByPlaceholder('or paste it here').fill('AIza-fake-key')
  await p.getByRole('button', { name: 'OK' }).click()
  await p.getByText('Key saved', { exact: true }).waitFor()
  await p.keyboard.press('Escape')
  await p.getByText(/Your must-sees \(3\)/).waitFor({ timeout: 10000 })
  expect(!(await text(p)).includes('Seine dinner cruise'), 'traps are not offered as must-sees')
  await p.getByRole('checkbox', { name: /Louvre/ }).uncheck()
  await p.getByRole('button', { name: 'Looks good' }).click()
  await p.getByText(/^Activities/).first().waitFor()
  const saved = await storedPlaces(p)
  const orsay = saved.find((x) => x.name === "Musée d'Orsay")
  expect(orsay.day && orsay.day !== 4, `Orsay planned, not on Monday (Day ${orsay.day})`)
  expect(saved.find((x) => x.name === 'Louvre').must === false, 'unticked must-see is an ordinary pick')
  expect(saved.find((x) => x.name === 'Seine dinner cruise').status === 'out', 'the trap starts skipped')
  // Change the vibe: leaving Setup re-scores the list and adds a better fit, keeping our choices.
  await p.evaluate(() => { location.hash = location.hash.replace(/\/plan.*$/, '/setup') })
  await p.getByRole('button', { name: /Vibe/ }).click()
  await p.getByRole('button', { name: 'More Family' }).click()
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'See the plan' }).click()
  await p.getByText(/Suggestions updated · 1 new/).waitFor({ timeout: 10000 })
  const after = await storedPlaces(p)
  const lux0 = saved.find((x) => x.name === 'Luxembourg Gardens'), lux = after.find((x) => x.name === 'Luxembourg Gardens')
  expect(lux.worth < lux0.worth && lux.status === lux0.status && lux.day === lux0.day, `re-scored, choices kept (${lux0.worth} → ${lux.worth})`)
  expect(after.find((x) => x.name === "Musée d'Orsay").day === orsay.day, 'days kept')
  expect(after.find((x) => x.name === 'Louvre').must === false, 'must-see choice kept')
  const jp = after.find((x) => x.name === 'Jardin des Plantes')
  expect(jp && jp.status === 'maybe' && jp.fresh, 'new fit added, unchecked, tagged New')
  await p.getByText('New', { exact: true }).first().waitFor()
  // Find more: type what we're after; it comes back unchecked, tagged New.
  await p.getByRole('button', { name: 'Find more' }).click()
  await p.getByPlaceholder(/Something specific/).fill('turtle release')
  await p.getByRole('button', { name: 'Search', exact: true }).click()
  await p.getByText(/Added 1, unchecked and tagged New: Sea turtle hatchling release/).waitFor({ timeout: 10000 })
  await p.keyboard.press('Escape')
  await p.getByText('Sea turtle hatchling release').first().waitFor()
  expect(p.errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, 'no errors: ' + p.errors.join(' | '))
  await p.screenshot({ path: `${SHOTS}/new-trip-plan.png` })
  await p.context().close()
})

// ---------- Offline ----------

await test('opens offline from the home screen (service worker cache)', async () => {
  const ctx = await browser.newContext({ ...PHONE })
  const p = await ctx.newPage()
  await p.goto(BASE + '?demo')
  await p.evaluate(() => navigator.serviceWorker.ready)
  await p.reload()
  await p.getByText('Next up').waitFor()
  await ctx.setOffline(true)
  await p.reload()
  await p.getByText('Next up').waitFor({ timeout: 5000 })
  await ctx.close()
})

// ---------- Speed on a slowed-down phone ----------

await test('speed: first screen < 1 s and screens switch < 150 ms (CPU 4× slower)', async () => {
  const p = await page()
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await p.goto(BASE + '?demo')
  await p.getByText('Next up').waitFor()
  const first = await p.evaluate(() => performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime ?? 9999)
  const tap = async (name) => p.evaluate(async (n) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === n)
    const t0 = performance.now()
    b.click()
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
    return performance.now() - t0
  }, name)
  const times = { plan: await tap('Plan'), today: await tap('Today'), plan2: await tap('Plan') }
  console.log(`   first paint ${Math.round(first)} ms; tab switches ${Object.values(times).map((x) => Math.round(x)).join(', ')} ms`)
  expect(first < 1000, `first paint ${Math.round(first)} ms`)
  expect(Math.max(...Object.values(times)) < 150, `tab switch ${JSON.stringify(times)}`)
  await p.context().close()
})

await browser.close()
srv.close()
for (const [s, n, x] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${n}${s === 'PASS' ? ` (${x} ms)` : `\n    ${x}`}`)
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

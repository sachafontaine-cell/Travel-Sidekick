// Travel Sidekick: the family's private Google script.
// This file is public (it lives in the app's repository) and holds no family data and no keys:
// the family key, the Gemini key and alert emails live in this script's properties; trip data
// lives in a private Sheet in your Drive. The script updates itself from the repository.
//
// What it does:
//   sync       both phones send and fetch changes (newest change wins, per record)
//   setKey     keeps the Gemini key so the other phone gets it automatically
//   scan       every hour and on request, in the background: new booking emails + the KAYAK
//              calendar become bookings in their trip, or a new trip (cleaned before Gemini)
//   hourly     7:00 destination time: checks must-see hours with Google, emails if one is closed
//              3 days before a trip: emails "download the language in Google Translate"
//   nightly    updates this script from the repository when a newer version is published

var VERSION = 3
var REPO_RAW = 'https://raw.githubusercontent.com/sachafontaine-cell/Travel-Sidekick/main/script/'
var APP_URL = 'https://sachafontaine-cell.github.io/Travel-Sidekick/'

// ---------- One-time setup (run from the editor) ----------

function setup() {
  var props = PropertiesService.getScriptProperties()
  if (!props.getProperty('KEY')) props.setProperty('KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 24))
  if (!props.getProperty('SHEET_ID')) props.setProperty('SHEET_ID', SpreadsheetApp.create('Travel Sidekick data (private)').getId())
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t) })
  ScriptApp.newTrigger('hourly').timeBased().everyHours(1).create()
  ScriptApp.newTrigger('nightly').timeBased().atHour(3).everyDays(1).create()
  Logger.log('KEY: ' + props.getProperty('KEY'))
  Logger.log('Next: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), copy the Web app URL, then open on each phone:')
  Logger.log(APP_URL + '?k=' + props.getProperty('KEY') + '&api=WEB_APP_URL')
}

/** Optional: use the Control Center's family key, so phones that already have it need nothing new. */
function useFamilyKey(key) {
  if (!key || String(key).length < 12) throw new Error('Paste the Control Center key: useFamilyKey("...")')
  PropertiesService.getScriptProperties().setProperty('KEY', String(key))
  Logger.log('Family key set.')
}

// ---------- Web app ----------

function doGet() { return out({ ok: true, v: VERSION }) }

function doPost(e) {
  var body
  try { body = JSON.parse(e.postData.contents) } catch (err) { return out({ error: 'Bad request' }) }
  var props = PropertiesService.getScriptProperties()
  if (!body || !body.k || body.k !== props.getProperty('KEY')) return out({ error: 'Wrong family key' })
  try {
    if (body.op === 'sync') return out(sync(body))
    if (body.op === 'setKey') { props.setProperty('GEMINI_KEY', String(body.gk || '').trim()); return out({ ok: true }) }
    if (body.op === 'setAlerts') { props.setProperty('ALERTS', JSON.stringify((body.emails || []).slice(0, 5).map(String))); return out({ ok: true }) }
    if (body.op === 'setKayak') {
      var u = String(body.url || '').trim()
      if (u && !/^(https|webcal):\/\//.test(u)) return out({ error: 'That is not a calendar link.' })
      props.setProperty('KAYAK_ICS', u.replace(/^webcal:/, 'https:'))
      props.deleteProperty('KAYAK_SEEN')
      requestScan()
      return out({ ok: true })
    }
    if (body.op === 'scan') { requestScan(); return out({ ok: true }) }
    if (body.op === 'update') return out(selfUpdate())
    if (body.op === 'ping') return out({ v: VERSION })
    return out({ error: 'Unknown request' })
  } catch (err) {
    return out({ error: String(err && err.message || err) })
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

// ---------- Records (the private Sheet) ----------
// One row per record: key (coll:id) | coll | at (changed, phone clock) | serverAt | JSON

function sheet() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'))
  var sh = ss.getSheetByName('records')
  if (!sh) { sh = ss.insertSheet('records'); sh.appendRow(['key', 'coll', 'at', 'serverAt', 'data']) }
  return sh
}

function readRows(sh) {
  var last = sh.getLastRow()
  return last > 1 ? sh.getRange(2, 1, last - 1, 5).getValues() : []
}

/** Upserts records (newest `at` wins) and returns everything changed since `since`. */
function putRecords(puts, since) {
  var lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    var sh = sheet()
    var rows = readRows(sh)
    var index = {}
    rows.forEach(function (r, i) { index[r[0]] = i })
    var now = Date.now()
    var changed = false
    ;(puts || []).forEach(function (rec) {
      if (!rec || !rec.coll || !rec.id) return
      var key = rec.coll + ':' + rec.id
      var row = [key, rec.coll, Number(rec.at) || 0, now, JSON.stringify(rec.data === undefined ? null : rec.data)]
      if (key in index) {
        if (Number(rows[index[key]][2]) <= row[2]) { rows[index[key]] = row; changed = true }
      } else { index[key] = rows.length; rows.push(row); changed = true }
    })
    if (changed && rows.length) sh.getRange(2, 1, rows.length, 5).setValues(rows)
    var recs = rows.filter(function (r) { return Number(r[3]) > (Number(since) || 0) }).map(function (r) {
      return { coll: r[1], id: String(r[0]).slice(String(r[1]).length + 1), at: Number(r[2]), data: JSON.parse(r[4]) }
    })
    return { now: now, recs: recs }
  } finally { lock.releaseLock() }
}

function sync(body) {
  var res = putRecords(body.put, body.since)
  res.v = VERSION
  res.scan = JSON.parse(PropertiesService.getScriptProperties().getProperty('SCAN') || 'null')
  if (body.wantKey) {
    var gk = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY')
    if (gk) res.gk = gk
  }
  return res
}

function allRecords(coll) {
  return readRows(sheet()).filter(function (r) { return r[1] === coll }).map(function (r) { return JSON.parse(r[4]) }).filter(function (d) { return d })
}

// ---------- Gemini (same free key as the phones) ----------

function gemini(prompt, opts) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY')
  if (!key) throw new Error('No Gemini key yet: add it in the app (Trips > This app).')
  var models = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest']
  for (var i = 0; i < models.length; i++) {
    // Quick answers: no slow hidden "thinking".
    var payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, thinkingConfig: /2\.5/.test(models[i]) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' } } }
    if (opts && opts.search) payload.tools = [{ google_search: {} }]
    var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true,
    })
    var code = r.getResponseCode()
    if (code === 200) {
      var j = JSON.parse(r.getContentText())
      var parts = (((j.candidates || [])[0] || {}).content || {}).parts || []
      return parts.filter(function (p) { return typeof p.text === 'string' && !p.thought }).map(function (p) { return p.text }).join('')
    }
    if (code === 400 && /think/i.test(r.getContentText())) {
      delete payload.generationConfig.thinkingConfig
      r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent?key=' + encodeURIComponent(key), { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true })
      code = r.getResponseCode()
      if (code === 200) {
        var j2 = JSON.parse(r.getContentText())
        var parts2 = (((j2.candidates || [])[0] || {}).content || {}).parts || []
        return parts2.filter(function (p) { return typeof p.text === 'string' && !p.thought }).map(function (p) { return p.text }).join('')
      }
    }
    if (code !== 429 && code !== 404 && code < 500) throw new Error('Gemini error ' + code)
    Utilities.sleep(1500)
  }
  throw new Error('Gemini is busy right now.')
}

function jsonIn(text) {
  var t = String(text || '').replace(/```(?:json)?/g, '')
  var a = t.indexOf('['), b = t.lastIndexOf(']')
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)) } catch (e) { /* fall through */ } }
  return []
}

// ---------- Bookings from Gmail ----------

/** Removes things Gemini's free tier should never see: card, passport and long reference numbers, emails, phones. */
function redact(text) {
  return String(text)
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[card]')
    .replace(/\b[A-Z]{1,2}\d{6,9}\b/g, '[id]')
    .replace(/\b\d{8,}\b/g, '[number]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d ().-]{8,}\d/g, '[phone]')
}

/** Booking emails not read yet (remembered by thread), fetched in one batch. */
function newBookingMail() {
  var seen = JSON.parse(PropertiesService.getScriptProperties().getProperty('SEEN') || '[]')
  var query = '(confirmation OR confirmed OR reservation OR booking OR itinerary OR "e-ticket" OR "check-in" OR "your trip") newer_than:180d'
  var threads = GmailApp.search(query, 0, 80).filter(function (t) { return seen.indexOf(t.getId()) < 0 }).slice(0, 25)
  if (!threads.length) return { texts: [], ids: [] }
  var texts = GmailApp.getMessagesForThreads(threads).map(function (list) {
    var m = list[list.length - 1]
    return 'Subject: ' + m.getSubject() + ' | Sent: ' + Utilities.formatDate(m.getDate(), 'UTC', 'yyyy-MM-dd') + '\n' + redact((m.getPlainBody() || '').slice(0, 1800))
  })
  return { texts: texts, ids: threads.map(function (t) { return t.getId() }) }
}

/** Events from the KAYAK Trips calendar link (if saved): flights, hotels, reservations. */
function kayakEvents() {
  var url = PropertiesService.getScriptProperties().getProperty('KAYAK_ICS')
  if (!url) return []
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true })
  if (r.getResponseCode() !== 200) return []
  var text = r.getContentText().replace(/\r?\n[ \t]/g, '')
  var events = []
  text.split('BEGIN:VEVENT').slice(1).forEach(function (block) {
    var get = function (k) { var m = new RegExp('^' + k + '[^:\\n]*:(.*)$', 'm').exec(block); return m ? m[1].trim().replace(/\\,/g, ',').replace(/\\n/g, ' ') : '' }
    var day = function (v) { var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(v); return m ? { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] ? m[4] + ':' + m[5] : '' } : null }
    var st = day(get('DTSTART')), en = day(get('DTEND'))
    if (st) events.push({ summary: get('SUMMARY'), location: get('LOCATION'), start: st.date, time: st.time, end: en ? en.date : st.date, note: get('DESCRIPTION').slice(0, 200) })
  })
  return events
}

var BOOKING_SHAPE = '{"name":"short name, e.g. Louvre tickets or Flight to Paris","kind":"flight|hotel|ticket|meal|other","date":"YYYY-MM-DD","time":"HH:MM local or empty","address":"street address, venue or airport name","note":"max 60 chars, no numbers"}'

function geocode(q, near) {
  var cache = CacheService.getScriptCache(), k = 'geo:' + (q + '|' + near).slice(0, 200)
  var hit = cache.get(k)
  if (hit) return JSON.parse(hit)
  var loc = null
  try {
    var g = Maps.newGeocoder().geocode(q + (near ? ', ' + near : ''))
    if (g.status === 'OK' && g.results.length) loc = { lat: g.results[0].geometry.location.lat, lng: g.results[0].geometry.location.lng }
  } catch (e) { /* unknown place */ }
  cache.put(k, JSON.stringify(loc), 21600)
  return loc
}

/** A city with its time zone and country (Open-Meteo, free). */
function findCity(name) {
  var r = UrlFetchApp.fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(name.split(',')[0]), { muteHttpExceptions: true })
  var c = r.getResponseCode() === 200 ? (JSON.parse(r.getContentText()).results || [])[0] : null
  if (c) return { name: [c.name, c.admin1 && c.admin1 !== c.name ? c.admin1 : '', c.country].filter(String).join(', '), lat: c.latitude, lng: c.longitude, tz: c.timezone, country: c.country_code, currency: '', lang: '' }
  var loc = geocode(name, '')
  return loc ? { name: name, lat: loc.lat, lng: loc.lng, tz: 'UTC', country: '', currency: '', lang: '' } : null
}

function newTripRecord(g, now) {
  var dest = findCity(g.destination)
  if (!dest) return null
  return {
    id: Utilities.getUuid(), name: dest.name.split(',')[0], dest: dest, start: g.start, end: g.end, vibes: {}, budget: { all: 2 }, pace: 'balanced', people: [],
    dayStart: 540, dayEnd: 1260, downtime: { on: true, minutes: 90 }, food: '', nos: [], home: 'USD', found: 'email', at: now, by: 'Email',
  }
}

function dayNumber(trip, date) {
  var ms = function (d) { return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) }
  return Math.round((ms(date) - ms(trip.start)) / 86400000) + 1
}

function bookingRecord(b, trip, loc, now) {
  var m = /^(\d{1,2}):(\d{2})/.exec(b.time || '')
  var fixed = m ? +m[1] * 60 + +m[2] : null
  return {
    id: Utilities.getUuid(), trip: trip.id, name: String(b.name).slice(0, 60), kind: b.kind === 'meal' ? 'meal' : 'other', lat: loc.lat, lng: loc.lng,
    badge: 'worth', must: false, worth: 7, value: 7, sub: { iconic: 5, vibe: 5, hassle: 5, kid: 5 }, rec: 'pay', recText: 'Already booked.', why: String(b.note || ''), tip: '',
    price: 0, minutes: b.kind === 'flight' ? 60 : 90, suggested: 90, indoor: true, status: 'picked', rank: 'a' + (1000 + (fixed || 0)).toString(36) + 'i',
    day: dayNumber(trip, b.date), dayRank: 'a' + (1000 + (fixed || 0)).toString(36) + 'i', fixed: fixed, booked: 'Booked · from your email', at: now, by: 'Email',
  }
}

/** A trip whose dates touch these dates (a family is on one trip at a time). */
function overlapping(trips, start, end) {
  return trips.filter(function (t) { return t.start && t.end && !(end < addDays(t.start, -1) || start > addDays(t.end, 1)) })[0] || null
}

/**
 * Reads new booking emails and the KAYAK calendar, then adds each booking to its trip, or creates
 * the trip ("Found in your email") when none covers those dates. Runs every hour and on request,
 * in the background: the phones never wait for it; results arrive with the next sync.
 */
function scan() {
  var props = PropertiesService.getScriptProperties()
  var now = Date.now()
  var today = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd')
  try {
    var mail = newBookingMail()
    var kSeen = JSON.parse(props.getProperty('KAYAK_SEEN') || '[]')
    var events = kayakEvents().filter(function (e) { return e.end >= today && kSeen.indexOf(e.summary + '|' + e.start) < 0 })
    if (!mail.texts.length && !events.length) { props.setProperty('SCAN', JSON.stringify({ at: now, added: 0, trips: 0 })); return { added: 0, trips: 0 } }
    var trips = allRecords('trip')
    var known = trips.filter(function (t) { return t.start && t.end }).map(function (t) { return { id: t.id, destination: t.dest && t.dest.name, start: t.start, end: t.end } })
    var prompt = 'Today is ' + today + '. Extract the travel bookings (flights, hotels, tickets, restaurant reservations) from these emails and calendar events. Ignore anything that ended before today and anything that is not a booking.\n' +
      'Group them by trip. If a booking falls within an existing trip\'s dates, use its id. Otherwise group it into a new trip (destination city = where they stay, not the home airport).\n' +
      'Existing trips: ' + JSON.stringify(known) + '\n' +
      'Reply with only a JSON array: [{"trip":"existing trip id or null","destination":"City, Country","start":"YYYY-MM-DD","end":"YYYY-MM-DD","bookings":[' + BOOKING_SHAPE + ']}]\n\n' +
      (events.length ? 'KAYAK calendar:\n' + JSON.stringify(events) + '\n\n' : '') + mail.texts.join('\n\n---\n\n')
    var groups = jsonIn(gemini(prompt))
    var places = allRecords('place')
    var puts = {}, added = 0, newTrips = 0
    var put = function (coll, d) { puts[coll + ':' + d.id] = { coll: coll, id: d.id, at: d.at, data: d } }
    groups.forEach(function (g) {
      if (!g || !g.start || !g.end) return
      var trip = trips.filter(function (t) { return t.id === g.trip })[0] || overlapping(trips, g.start, g.end)
      if (!trip) {
        if (g.end < today || !g.destination) return
        trip = newTripRecord(g, now)
        if (!trip) return
        trips.push(trip); put('trip', trip); newTrips++
      }
      ;(g.bookings || []).forEach(function (b) {
        if (!b || !b.name || !b.date || b.date < addDays(trip.start, -1) || b.date > trip.end) return
        var loc = geocode(b.address || b.name, trip.dest && trip.dest.name)
        if (b.kind === 'hotel') {
          if (!trip.base && loc) { trip.base = { name: String(b.name).slice(0, 60), lat: loc.lat, lng: loc.lng }; trip.at = now; put('trip', trip) }
          return
        }
        if (!loc || b.date < trip.start) return
        var name = String(b.name).slice(0, 60).toLowerCase()
        var day = dayNumber(trip, b.date)
        if (places.some(function (p) { return p.trip === trip.id && p.name.toLowerCase() === name && p.day === day })) return
        var rec = bookingRecord(b, trip, loc, now)
        places.push(rec); put('place', rec); added++
      })
    })
    var list = Object.keys(puts).map(function (k) { return puts[k] })
    if (list.length) putRecords(list, now)
    var seen = JSON.parse(props.getProperty('SEEN') || '[]').concat(mail.ids)
    props.setProperty('SEEN', JSON.stringify(seen.slice(-800)))
    props.setProperty('KAYAK_SEEN', JSON.stringify(kSeen.concat(events.map(function (e) { return e.summary + '|' + e.start })).slice(-400)))
    props.setProperty('SCAN', JSON.stringify({ at: now, added: added, trips: newTrips }))
    return { added: added, trips: newTrips }
  } catch (e) {
    props.setProperty('SCAN', JSON.stringify({ at: now, error: String(e && e.message || e) }))
    throw e
  }
}

/** Runs a scan in about a minute, without making the phone wait. */
function requestScan() {
  var waiting = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'scanNow' })
  if (!waiting) ScriptApp.newTrigger('scanNow').timeBased().after(1000).create()
}
function scanNow() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'scanNow') ScriptApp.deleteTrigger(t) })
  try { scan() } catch (e) { console.error('Scan failed: ' + e) }
}

// ---------- Timed jobs ----------

function sentBefore(id) {
  var props = PropertiesService.getScriptProperties()
  var sent = JSON.parse(props.getProperty('SENT') || '[]')
  if (sent.indexOf(id) >= 0) return true
  sent.push(id)
  props.setProperty('SENT', JSON.stringify(sent.slice(-300)))
  return false
}

function recipients() {
  var list = JSON.parse(PropertiesService.getScriptProperties().getProperty('ALERTS') || '[]')
  return list.length ? list.join(',') : Session.getEffectiveUser().getEmail()
}

function email(id, subject, text) {
  if (sentBefore(id)) return
  MailApp.sendEmail({ to: recipients(), subject: subject, body: text + '\n\nOpen the app: ' + APP_URL })
}

function addDays(d, n) {
  var t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86400000)
  return t.toISOString().slice(0, 10)
}
var WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function hourly() {
  try { scan() } catch (e) { console.error('Scan failed: ' + e) }
  var trips = allRecords('trip')
  if (!trips.length) return
  var places = allRecords('place')
  trips.forEach(function (trip) {
    if (!trip.dest || !trip.dest.tz || !trip.start) return
    var now = new Date()
    var today = Utilities.formatDate(now, trip.dest.tz, 'yyyy-MM-dd')
    var hour = Number(Utilities.formatDate(now, trip.dest.tz, 'H'))
    // 3 days before: download the language for offline use.
    if (trip.dest.lang && trip.dest.lang !== 'en' && today === addDays(trip.start, -3)) {
      email('lang:' + trip.id, trip.name + ' in 3 days: download the language',
        'Before you go: open Google Translate, download ' + trip.dest.lang + ' for offline use, so it works with no signal.\nhttps://translate.google.com/?sl=' + trip.dest.lang + '&tl=en')
    }
    if (hour !== 7 || today < addDays(trip.start, -1) || today > trip.end) return
    checkTrip(trip, places, today)
  })
}

/** Must-sees planned today and tomorrow: hours checked with Google; email if one is closed. */
function checkTrip(trip, places, today) {
  var dayOf = function (d) { return Math.round((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(+trip.start.slice(0, 4), +trip.start.slice(5, 7) - 1, +trip.start.slice(8, 10))) / 86400000) + 1 }
  var due = places.filter(function (p) {
    if (p.trip !== trip.id || !p.must || p.done || p.status === 'out' || !p.day) return false
    return p.day === dayOf(today) || p.day === dayOf(today) + 1
  }).slice(0, 8)
  if (!due.length) return
  var items = due.map(function (p, i) { var date = addDays(trip.start, p.day - 1); return (i + 1) + '. ' + p.name + ', ' + trip.dest.name + ' — ' + WEEKDAY[new Date(date + 'T12:00:00Z').getUTCDay()] + ' ' + date })
  var prompt = 'Using Google Search, give the opening hours for each place on the given date (check holidays and special closures).\n' + items.join('\n') +
    '\nReply with only a JSON array, one object per line number: [{"n":1,"open":"HH:MM","close":"HH:MM","closed":false}]'
  var found = jsonIn(gemini(prompt, { search: true }))
  var updates = []
  found.forEach(function (r) {
    var p = due[r.n - 1]
    if (!p) return
    var date = addDays(trip.start, p.day - 1)
    var hm = function (s) { var m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null }
    var o = hm(r.open), c = hm(r.close)
    var value = r.closed ? null : (o != null && c != null ? [o, c <= o ? 1440 : c] : undefined)
    if (value === undefined) return
    var hours = p.hours || {}
    hours.dates = hours.dates || {}
    hours.dates[date] = value
    hours.checkedAt = Date.now()
    hours.source = 'google'
    p.hours = hours
    p.at = Date.now()
    p.by = 'Google check'
    updates.push({ coll: 'place', id: p.id, at: p.at, data: p })
    if (r.closed) email('closed:' + p.id + ':' + date, p.name + ' is closed on Day ' + p.day,
      p.name + ' is closed on ' + WEEKDAY[new Date(date + 'T12:00:00Z').getUTCDay()] + ' ' + date + ' (Day ' + p.day + '), when it is planned.\nOpen the app and tap Fix it to move it to an open day.')
  })
  if (updates.length) putRecords(updates, Date.now())
}

// ---------- Self-update (Apps Script API) ----------

function api(method, url, payload) {
  var r = UrlFetchApp.fetch(url, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: payload ? JSON.stringify(payload) : undefined,
  })
  if (r.getResponseCode() >= 300) throw new Error('Apps Script API ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200))
  return JSON.parse(r.getContentText() || '{}')
}

/** The web app deployment to move to each new version (found once, then remembered). */
function deploymentId() {
  var props = PropertiesService.getScriptProperties()
  var id = props.getProperty('DEPLOYMENT_ID')
  if (id) return id
  var list = api('get', 'https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + '/deployments').deployments || []
  var web = list.filter(function (d) {
    return d.deploymentConfig && d.deploymentConfig.versionNumber && (d.entryPoints || []).some(function (e) { return e.entryPointType === 'WEB_APP' })
  })
  if (!web.length) throw new Error('No web app deployment found: deploy it once from the editor.')
  id = web[web.length - 1].deploymentId
  props.setProperty('DEPLOYMENT_ID', id)
  return id
}

function nightly() {
  try { selfUpdate() } catch (e) { console.error('Update failed: ' + e) }
}

/** Pulls the newest script from the repository and moves the web app to it (same address). */
function selfUpdate() {
  var remote = JSON.parse(UrlFetchApp.fetch(REPO_RAW + 'version.json').getContentText())
  if (!(remote.version > VERSION)) return { ok: true, v: VERSION, latest: true }
  var code = UrlFetchApp.fetch(REPO_RAW + 'Code.gs').getContentText()
  var manifest = UrlFetchApp.fetch(REPO_RAW + 'appsscript.json').getContentText()
  if (code.indexOf('var VERSION = ' + remote.version) < 0) throw new Error('Version mismatch in the repository; not updating.')
  var base = 'https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId()
  var dep = deploymentId()
  api('put', base + '/content', { files: [{ name: 'Code', type: 'SERVER_JS', source: code }, { name: 'appsscript', type: 'JSON', source: manifest }] })
  var ver = api('post', base + '/versions', { description: 'v' + remote.version })
  api('put', base + '/deployments/' + dep, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description: 'Travel Sidekick script v' + remote.version } })
  // New Google permissions can't be granted by a script: if the update needs one, say so by email.
  if (remote.newScopes) email('scopes:' + remote.version, 'Travel Sidekick needs one approval', 'The family script was updated and needs a new permission. Open the script, run setup once, and approve.')
  return { ok: true, v: remote.version }
}

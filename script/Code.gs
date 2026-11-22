// Travel Sidekick: the family's private Google script.
// This file is public (it lives in the app's repository) and holds no family data and no keys:
// the family key, the Gemini key and alert emails live in this script's properties; trip data
// lives in a private Sheet in your Drive. The script updates itself from the repository.
//
// What it does:
//   sync       both phones send and fetch changes (newest change wins, per record)
//   setKey     keeps the Gemini key so the other phone gets it automatically
//   bookings   reads booking confirmations in Gmail for the trip dates (cleaned before Gemini)
//   hourly     7:00 destination time: checks must-see hours with Google, emails if one is closed
//              3 days before a trip: emails "download the language in Google Translate"
//   nightly    updates this script from the repository when a newer version is published

var VERSION = 1
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
    if (body.op === 'bookings') return out({ bookings: bookings(String(body.dest || ''), String(body.start || ''), String(body.end || '')) })
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
  var payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }
  if (opts && opts.search) payload.tools = [{ google_search: {} }]
  for (var i = 0; i < models.length; i++) {
    var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true,
    })
    var code = r.getResponseCode()
    if (code === 200) {
      var j = JSON.parse(r.getContentText())
      var parts = (((j.candidates || [])[0] || {}).content || {}).parts || []
      return parts.filter(function (p) { return typeof p.text === 'string' && !p.thought }).map(function (p) { return p.text }).join('')
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

function bookings(dest, start, end) {
  if (!dest || !start || !end) return []
  var city = dest.split(',')[0].trim()
  var query = '(confirmation OR confirmed OR reservation OR booking OR itinerary OR ticket) newer_than:1y'
  var threads = GmailApp.search(query, 0, 40)
  var texts = []
  threads.forEach(function (th) {
    th.getMessages().slice(-1).forEach(function (m) {
      var body = m.getPlainBody() || ''
      if (body.indexOf(city) < 0 && body.indexOf(start) < 0) return
      texts.push('Subject: ' + m.getSubject() + '\n' + redact(body.slice(0, 2500)))
    })
  })
  if (!texts.length) return []
  var prompt = 'From these booking emails, list the bookings for a trip to ' + dest + ' from ' + start + ' to ' + end + '.\n' +
    'Only bookings inside those dates. Reply with only a JSON array: [{"name":"short name, e.g. Louvre tickets or Flight to Paris","kind":"flight|hotel|ticket|meal|other","date":"YYYY-MM-DD","time":"HH:MM local","address":"street address or venue/airport name","note":"max 60 chars, no numbers"}]\n\n' +
    texts.slice(0, 15).join('\n\n---\n\n')
  var list = jsonIn(gemini(prompt))
  var geo = Maps.newGeocoder()
  return list.filter(function (b) { return b && b.name && b.date }).slice(0, 20).map(function (b) {
    var lat = null, lng = null
    try {
      var g = geo.geocode((b.address || b.name) + ', ' + dest)
      if (g.status === 'OK' && g.results.length) { lat = g.results[0].geometry.location.lat; lng = g.results[0].geometry.location.lng }
    } catch (e) { /* no location: the app skips it */ }
    return { name: String(b.name).slice(0, 60), kind: b.kind, date: b.date, time: b.time, lat: lat, lng: lng, note: b.note }
  })
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

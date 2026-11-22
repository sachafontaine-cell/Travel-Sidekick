# Travel Sidekick — app review + build plan

Status: review only. No app code until Sacha approves (see `SPEC.md`).
Mockups in `mockups/` use sample names; the live canvas has the real ones.

## 1. Decided
- **Look:** Fontaine scheme (section 6).
- **Build:** web app on GitHub Pages (like Chef Luc) + one private Google script (like the Control Center).
- **Ghost guide:** plays only while the app is open.
- **Alerts:** by email from the Google script.
- **Day shape:** start and end with −/+ (15 min), suggestion in parentheses, "Custom" tag. Booked tickets keep their time.
- **Downtime:** not a set time. Setup holds on/off + length; each day fits it in like an activity (after lunch when it can); drag it in Days.
- **Activity Card:** a dialog. Closes with X or a tap outside.
- **Must-sees hours:** the Google script checks every must-see each morning (7:00) with Gemini + Google Search (free). The Card shows "Open today … · checked with Google" + **Check hours ↗** (Google Maps). Must-sees shows when it last checked. Email if a must-see is closed on its planned day.
- **"Almost sold out"** dropped (no data source) → "timed tickets: book ahead".
- **Translator:** no built-in one. Trip tab has a **Google Translate ↗** link. Prep has **Before you go: download French in Google Translate** (checkbox + link), and the script emails a reminder 3 days before the trip.

## 1c. Decisions (Nov 22, later)
- **No paid Google services, no card.** Gemini stays on the free tier: its project never gets billing (a project with billing loses the free tier). The hours check uses Gemini with Google Search (free daily allowance) instead of the paid Places service; OpenStreetMap hours as backup. Walking times use the Google script's built-in Maps (free). Self-update needs a Cloud project but no billing.
- **Own Gemini key**, in its own new project ("Travel Sidekick" in AI Studio). Free limits are per project, so sharing Chef Luc's would split one allowance across three apps. Chef Luc's key stays as a one-tap fallback.
- **GitHub two-step login:** yes.
- **Steps:** no reliable way from a web app (see chat). Pace = today's planned walking + where you are when the app is open + one-tap Tired / OK / Fresh.
- **OK:** + Add on List; first-run "Building your list" screen; Setup sections shrink to summaries after the first time; prices "€27 pp ($29)"; day tabs scroll for long trips.
- **Vibes:** pick as many as you like; each gets its own % with −/+ (10% steps). Total is always 100%: + takes from the biggest share. Suggestion in parentheses, "Custom" tag.
- **Must-sees:** the AI proposes them on the first-run screen (untick any, + add one). Later: the star on the place's Card (the one place). Must-sees can't be eliminated, only pushed down.

## 1b. Engineering review: app + script (Nov 22)
**App**
1. **The day planner is plain code, not AI.** It places items around bookings, opening hours, closing days, downtime, meals, start/end and the walking limit, in milliseconds. It powers Days, Rebalance, rain plan B and flight changes. Gemini only gives opinions (scores, why, tips) and answers Ask. Asking AI to plan the day would be slow and unreliable.
2. **AI for opinions, Google for facts.** Each place is matched once to a Google place (location, hours, closing days) and cached. Scores come from Gemini; hours and locations never do.
3. **Times are calculated, not stored.** Only the order and fixed bookings are saved; times are recomputed on every change. Dragging stays instant and times never go stale.
4. **Each place needs a "time there"** for the planner (added to the Card, −/+).
5. **Time zone = the destination's.** Before the trip the phone is on California time; the script also runs on California time. Everything uses Paris time.
6. **"Another idea" and "What now?" pick from a ranked list on the phone**, so taps are instant. No AI call per tap.
7. **Structured AI answers** (fixed JSON format), so the app never breaks on a chatty answer.
8. **Dates fixed:** Jun 12–19 is 8 days, but the plan has 7. Trip is now Jun 12–18.

**Sync between the two phones**
9. Each change is saved as a small "edit" (who, when, what), not the whole trip. Two parents editing at once never wipe each other's work. List order uses sortable keys, so two reorders merge cleanly.
10. Script calls use a plain-text POST (no browser pre-check) and the script locks while writing. Same trick as the Control Center.

**Script**
11. **Jobs:** nightly self-update + booking scan; 7:00 Paris time hours check; flight-change scan every 30 min during the trip; the "download French" reminder. All well inside Google's free daily limits.
12. **Booking emails are cleaned before Gemini sees them:** passport and card numbers are removed (Gemini's free tier may be used by Google).
13. **Only Sacha's inbox is read.** Bookings in Imose's inbox: forward them, or use the KAYAK calendar link.
14. **Emails are never sent twice** (each alert has an ID).
15. **Keys are locked down:** Gemini key limited to Gemini, in a project with no billing, so it can never cost anything.
16. **Self-update trust:** whoever can push to this repo controls the script, so GitHub needs two-step login. The script only takes code from `main`.
17. **App and script know each other's version**; a mismatch triggers the self-update.

**Mockups fixed in this pass**
- Trip dates Jun 12–18 (Trips, Setup, Today).
- Card: "Time there" with −/+; tip no longer says 9 AM (before your 10:30 start).
- New **Rebalance** sheet: one screen for Review, Fix it, rain and flight changes; each change can be unticked; Apply / Not now; Undo after.
- Trips: **This app** section (this phone, Gemini key, hours check, email alerts) + version ↻. Keys and who-is-this-phone aren't trip settings, so they don't belong in Trip Setup.
- Setup: budget, pace and crowd are real buttons.

## 2. Speed: the plan (top priority)
Goal on the Pixel 7: opens in under 1 s, every tap answers in under 0.1 s, screens switch in under 0.15 s.

1. **Local first.** All trip data lives on the phone (IndexedDB) and the screens draw from memory. Nothing a person taps waits for the network.
2. **The Google script is slow** (1–3 s per call, more when cold). It only syncs in the background: changes are saved on the phone at once and sent after. The other phone pulls changes when opened and every minute while open.
3. **AI work is done ahead of time.** One batch Gemini call scores the whole list when the trip is set up (Worth it, Value, sub-scores, why, tip), so the Card opens instantly. Ghost guide stories are written the night before. Only Ask and Snap wait for AI, and Ask streams the answer word by word.
4. **Gemini is called straight from the phone, not through the script** (saves 1–3 s, allows streaming). The key stays in the script's settings; the script hands it to your two phones once, through the private family link (like the Control Center link). Never in this public repo.
5. **Walking times show instantly** from a straight-line estimate (with a kid factor), then are corrected by Google Maps in the background and cached.
6. **Small app.** Preact (tiny), no map library, no UI kit, inline icons, one self-hosted title font that never blocks text. Everything is cached by the service worker, so it opens offline from the home screen.
7. **No in-app map** (maps are heavy). "Open in Google Maps" from the Card instead.
8. **Snap photos are shrunk** on the phone before upload.
9. **Instant feedback** on every press (same 120 ms press effect as Chef Luc). Moves are applied at once with Undo, never with a spinner.
10. **Tested for speed.** Automated phone tests (as in the Control Center) run with a slowed CPU and slow network and fail if the targets above are missed.

## 3. Review findings (decide before coding)
1. **Steps can't be read.** A web app can't see the phone's step count, so "Family pace down 20%" can't come from steps. Proposal: estimate from today's walking so far + a one-tap "How's everyone? Tired / OK / Fresh" on Today.
2. **No way to add a place.** Add "+ Add" on List: type a name, it appears at once ("Scoring…") and Gemini fills the scores in ~2 s.
3. **First run.** Building the list is the one slow moment (~10–20 s, once per trip). Needs a "Building your Paris list…" screen.
4. **One Rebalance screen.** Days "Review" and Must-sees "Fix it" should open the same rebalance sheet (one place). Not mocked yet.
5. **Trip Setup is very long.** After the first setup, each section shrinks to a one-line summary; tap to open.
6. **Vibe weights (60/40) have no control.** Proposal: first pick = 60%, second = 40%, tap to swap.
7. **Food slider and Hard nos** need real controls (slider, and Hard nos as removable chips).
8. **Currency.** Card shows $ but Paris prices are in €. Proposal: "€27 pp ($29)" everywhere.
9. **Longer trips.** D1–D7 tabs must scroll sideways for 10+ days.

## 4. Fix in the build (no decision needed)
- Budget, pace and crowd choices become real buttons (44 px).
- Swipe to eliminate also in the long-press menu (accessibility).
- Empty and error states: no trips yet, offline, AI limit reached, no menu snapped before a bill check (then it checks math, currency trap and service only), trip over.
- Mammoth "Profile incomplete": Setup highlights what's missing.
- Sync: last change wins per item; a small note when the other phone changed what you're looking at.
- Light and dark mode.

## 5. Build plan
**App:** Preact + Vite + TypeScript + `vite-plugin-pwa`. Every push to `main` tests, builds and publishes. `?demo` shows the sample Paris trip. No family data in this public repo.

**Google script (private, not in this repo):**
- Sync between both phones (private Sheet).
- Bookings from Gmail on a timer; optional KAYAK calendar link.
- Emails: flight changes, must-see closed on its day, "download French" 3 days before.
- Must-see hours each morning: Gemini + Google Search (free); OpenStreetMap as backup. No billing anywhere.
- Walking/transit times from Google Maps, cached.
- Holds the Gemini key and hands it to the family's phones.

**Other:** weather from Open-Meteo (free, no key), exchange rates from a free daily rate feed.

**Phases**
1. Core: Trips, Setup, List, Card, Days, Must-sees, sync, demo data, speed tests.
2. Smart: list building + scores, Ask, What now?, rain plan B, bookings from email, leave-by, hours check, emails.
3. Snap (translate photos, bill check), Prep, Ghost guide.

## 5b. No manual script updates (proposal)
1. **Thin script.** Almost all logic lives in the app, which updates itself. The script only does sync, Gmail search, timers and emails. Prompts and rules are stored as data in the Sheet, so changing them needs no script update.
2. **Self-updating script.** The script's code lives in `script/` in this repo (no family data, keys only in Script Properties). The script pulls new code from `main` and redeploys itself at the same address, using the Apps Script API. It runs nightly, and the app asks for it when it needs a newer script version. If a new Google permission is ever needed, the script emails a one-link approval.
3. **Fallback:** a GitHub Action deploys with `clasp`. Needs a one-time login on a computer and a token stored as a GitHub secret (broader access), so second choice.

One-time setup (~15 min, computer, click-by-click steps in the README): Google Cloud project (no billing), turn on the Apps Script API, paste a short starter script, approve, deploy. Self-update is tested first thing in Phase 1; if Google blocks it, use the fallback.

## 5c. Lessons from Chef Luc, Wardrobe COO and the Control Center
**Gemini key (easy, one paste for both phones)**
- All Fontaine apps share one web address, so if this phone already has Chef Luc's or Wardrobe COO's key: one tap, "Use the key from Chef Luc".
- Otherwise Chef Luc's flow: **Get a key** (opens AI Studio) → Create API key → **Paste key**; checked in ~1 s without spending a request.
- The app hands the key to the script once; the other parent's phone picks it up on its next sync. Never in backups or the repo.

**Gemini on the free tier**
- Switch models when one is busy and remember the one that works.
- Stream replies, catch stalls, low thinking, clear timeouts, a visible Retry.
- Small photo uploads; a snap is saved at once and read in the background.

**App**
- Reuse the Control Center family link: phones that already have it need nothing new.
- Ask once "Sacha or Imose?" so changes show who made them.
- Updates without restarting: check on open and every 30 min, apply when you leave; version + ↻ at the bottom; safety-net reset if stuck.
- Never redraw a text box while someone types.
- Changes go out in the background with Retry, and never twice (Cozi lesson).
- Typed text survives closing the app.
- Full-bleed navy/gold icon, installable, "Add to home screen" card.
- End-to-end tests (phone sizes, light/dark, offline, fake script) + screenshots, one version number everywhere, "Where to change what" table in the README.

## 6. Fontaine scheme
| Token | Light | Dark |
|---|---|---|
| Background | `#F7F3EA` | `#0E1729` |
| Surface | `#FFFFFF` | `#16223A` |
| Text / primary | `#14213D` | `#F2EDE2` / primary `#E7C46A` |
| Muted | `#55524B` | `#B8B2A5` |
| Border | `#E0D8C6` | `#2F4064` |
| Gold | `#D9A21B` (text: `#7A5600`) | `#E0A21C` |
| Success | `#E9EFE4` / `#2E4A2B` | `#22362A` / `#B9D8AE` |
| Amber | `#F6E3B4` / `#6B4A00` | `#4A3A10` / `#F6E3B4` |
| Red | `#F6D3CC` / `#7A1F12` | `#5A2018` / `#F6D3CC` |

Titles DM Serif Display, body system sans. Gold crest on Trips. Must-See badge navy + gold; Hidden Gem / Scheduled green; At risk amber; Tourist Trap / Last chance red. Ask button gold.

## 7. Where to change what (one place each)
| Thing | Change it in |
|---|---|
| Destination, dates, vibe, budget, pace, people, miles, day shape, downtime length | Trip Setup |
| Picked / undecided / eliminated, adding a place | List |
| Order and timing within a day, downtime position | Days |
| Bookings | Gmail / KAYAK (read automatically) |
| Gemini key, who this phone is, email alerts | Trips → This app |
| Must-see or not | The star on the place's Card |

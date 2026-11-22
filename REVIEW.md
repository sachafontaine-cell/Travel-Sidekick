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
- **Must-sees hours:** the Google script checks every must-see against Google's place data each morning (7:00). The Card shows "Open today … · checked with Google" + **Check hours ↗** (Google Maps). Must-sees shows when it last checked. Email if a must-see is closed on its planned day.
- **"Almost sold out"** dropped (no data source) → "timed tickets: book ahead".
- **Translator:** no built-in one. Trip tab has a **Google Translate ↗** link. Prep has **Before you go: download French in Google Translate** (checkbox + link), and the script emails a reminder 3 days before the trip.

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
- Must-see hours from Google's place data, each morning. Needs a Google Cloud key with billing turned on; a family trip should stay inside Google's free monthly allowance.
- Walking/transit times from Google Maps, cached.
- Holds the Gemini key and hands it to the family's phones.

**Other:** weather from Open-Meteo (free, no key), exchange rates from a free daily rate feed.

**Phases**
1. Core: Trips, Setup, List, Card, Days, Must-sees, sync, demo data, speed tests.
2. Smart: list building + scores, Ask, What now?, rain plan B, bookings from email, leave-by, hours check, emails.
3. Snap (translate photos, bill check), Prep, Ghost guide.

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
| Gemini and Google keys | Google script settings |

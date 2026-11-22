# Travel Sidekick

Phone-first family trip sidekick (Pixel, Chrome). Installable, works offline. Never miss a must-see.
Same family as Chef Luc, Wardrobe COO and the Control Center: navy and gold, the fleur-de-lis.

- **Open it:** https://sachafontaine-cell.github.io/Travel-Sidekick/ then Chrome ⋮ → *Install app*.
- **Sample trip (made-up family in Paris):** https://sachafontaine-cell.github.io/Travel-Sidekick/?demo
- **Version / update:** Trips → ⚙ → the version at the bottom checks right away. The app also checks when opened and every 30 min, and updates when you leave it.

No family data lives in this public repository. Trips stay on your phones and in a private Sheet in your Drive.

## What's in version 0.1
- **Today**: next up and when to leave (walk or metro + kid buffer), "done?" for what just ended, **What now?** when there's 30+ free minutes (Tired / OK / Fresh), must-see alerts. Before the trip: the before-you-go list.
- **Plan**: *All* = must-sees countdown, Picked, Maybe, Eliminated (drag ☰ to reorder, swipe ← to drop, → to pick, Undo after every change). *D1, D2…* = each day's timeline: bookings, opening hours, lunch, downtime (drag it anywhere), dinner time, walking vs. the group limit.
- **Activity Card** (a dialog: ✕ or tap outside): ★ must-see, worth it, price in € with $, recommendation, hours + **Check hours ↗**, time there, day, ⋯ (done, maybe, eliminate), *Why 9.5?*.
- **Rebalance**: one screen for Review (days), Fix it (must-sees). Each change can be unticked; Undo after.
- **Ask**: Gemini that knows the trip, the plan, today and the weather. Can propose a move (Apply / Not now).
- **Trip**: Google Translate ↗, KAYAK ↗, Google Maps ↗, local rules, trip setup.
- **Trip setup**: six rows (where & when, who's coming, vibe, budget, day shape, food & hard nos). Suggestions in parentheses; "Custom" when changed.
- **First run**: builds ~30 places with Gemini (about 20 s, once), plans the days, then you confirm the must-sees.
- **Bookings and trips from your email** (and your KAYAK calendar link, optional): the family script reads new booking emails every hour, in the background. A booking during a trip joins it at its booked time. Bookings for other dates are only suggested on the Trips screen ("Found in your email": **Add this trip** / **Not this one**); an added trip gets your family, currency, language and hotel by itself. Nothing in the app ever waits for email. Trips and the Trip tab show when it last checked, with **Check now**.
- **Photos**: each place's official photo from Wikipedia/Wikidata, only when the article is clearly about that place (name and location). Restaurants usually have none: use **Photos on Google Maps ↗** on the card.

Coming in 1.1: Snap (menus, receipts and bill check). Later: stories on a place's card.

## One-time setup

### 1. Publish the app (1 min)
Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. Every push to `main` tests, builds and publishes.

### 2. Gemini key (2 min, free) — in the app
Trips → ⚙ **This app** → **Get a key** (AI Studio: *Create API key* → **Create in new project**) → copy → **Paste key**.
Never turn on billing in that Google project: a project with billing loses the free tier. The key is shared with the other phone through the family script.

### 3. Family script (15 min, on a computer) — for sync between phones, emails and bookings
Without it the app works on one phone, with no emails.

1. **Google Cloud project (no billing):** https://console.cloud.google.com → new project "Travel Sidekick" → *APIs & Services → Enable APIs* → **Apps Script API**. *OAuth consent screen*: External, app name "Travel Sidekick", your email; then **Publish app** (in production; "unverified" is fine for your own use). Note the **project number** (home page).
2. **Allow scripts to be updated:** https://script.google.com/home/usersettings → **Google Apps Script API: On**.
3. **The script:** https://script.google.com → *New project* "Travel Sidekick". *Project Settings* (gear): tick **Show "appsscript.json"**, set **Google Cloud Platform project → Change project** to the project number above.
4. Replace `Code.gs` with [`script/Code.gs`](script/Code.gs) and `appsscript.json` with [`script/appsscript.json`](script/appsscript.json). Save.
5. Pick **setup** in the function list → **Run** → approve (Sheets, Gmail read-only, send email, Maps, updating itself). Optional: to reuse the Control Center's family key, run `useFamilyKey("…")` with it.
6. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Copy the Web app URL.
7. *Execution log* shows the family link. Open it once on each parent's phone:
   `https://sachafontaine-cell.github.io/Travel-Sidekick/?k=KEY&api=WEB_APP_URL` (keep it private).
8. In the app: Trips → ⚙ → **Email alerts**: both parents' emails.

**After that, never again:** the script updates itself from this repository each night (and when the app needs a newer script), at the same address. If a future version ever needs a new Google permission, you get one email with what to approve.

## Where to change what (one place each)
| Thing | Change it in |
|---|---|
| Destination, dates, hotel, people, miles, vibe, budget, pace, day shape, downtime length, food, hard nos | Trip setup |
| Picked / Maybe / Eliminated, order, adding a place | Plan → All |
| Order and timing in a day, where downtime goes | Plan → that day |
| Must-see or not, time there, which day, done | The place's card |
| Gemini key, who this phone is, email alerts, the family link (copy/share) | ⚙ (top right of every screen) |
| Bookings | Gmail (read every hour) and the KAYAK calendar link (⚙ This app) |

## How it stays fast
Everything is on the phone and every screen draws from memory; nothing a tap does waits for the network. The day planner is plain code (milliseconds), Gemini work is done ahead of time (scores when the list is built), Ask streams its answer, walking times are estimated instantly. Sync, weather, exchange rate and hours checks run in the background.

## Develop
`npm install`, `npm run dev`, `npm test` (planner, rebalance, vibes, the Google script against fake Google services), `npm run e2e` (builds, then phone-size browser tests: sample trip, a whole new trip with Gemini faked, offline, dark mode, speed budgets). Icons: `node scripts/icons.mjs suitcase` (designs in `scripts/icon-designs.mjs`).

Script changes: edit `script/Code.gs`, raise `VERSION` there **and** in `script/version.json` (same number), push to `main`. The family script picks it up that night.

Files: `src/lib/planner.ts` (day planner), `rebalance.ts`, `musts.ts`, `whatnow.ts`, `ai.ts` (Gemini prompts), `sync.ts`, `data.ts` (local store, undo, sync queue); screens in `src/screens/`; the family script in `script/`.

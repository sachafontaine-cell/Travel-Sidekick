# Travel Sidekick — mockup review + build plan

Status: review only. No app code until Sacha approves (see `SPEC.md`).
Mockups in `mockups/` use sample names; the live canvas has the real ones.

## 1. Restyled to the Fontaine scheme (done)
Same tokens as Chef Luc and Wardrobe COO:

| Token | Light | Dark (for the build) |
|---|---|---|
| Background | `#F7F3EA` cream | `#0E1729` |
| Surface | `#FFFFFF` | `#16223A` |
| Text / primary | `#14213D` navy | `#F2EDE2` / primary `#E7C46A` |
| Muted | `#55524B` | `#B8B2A5` |
| Border | `#E0D8C6` | `#2F4064` |
| Gold accent | `#D9A21B` (text on light: `#7A5600`) | `#E0A21C` |
| Success | `#E9EFE4` / `#2E4A2B` | `#22362A` / `#B9D8AE` |
| Amber | `#F6E3B4` / `#6B4A00` | `#4A3A10` / `#F6E3B4` |
| Red | `#F6D3CC` / `#7A1F12` | `#5A2018` / `#F6D3CC` |

- Titles: DM Serif Display. Body: system sans (Roboto on the Pixel).
- Gold crest on the Trips screen, like Wardrobe COO.
- Hero cards (Paris, What now?, Snap anything) are navy. Progress bars are gold.
- Ask button is gold with navy text, so it stands out from the navy buttons.
- Badges: Must-See = navy + gold. Hidden Gem / Scheduled = green. At risk / Depends = amber. Tourist Trap / Last chance = red.

## 2. Fixes made in the mockups
1. **Snap:** "Should be € [CORRECT] / Billed € [BILLED]" placeholders → €62.00 / €64.00 (matches the +€2 error).
2. **Activity Card:** "Add to Day 4" → "On Day 4 · 11:00". Eiffel Tower is already on Day 4 (Ask and Must-sees say so).
3. **Today:** "Leave by 12:25" did not add up (12 + 5 min = 12:28). Kid buffer → 8 min.
4. **Touch targets:** filter chips, vibe chips, −/+ steppers, Ask chips, Adult toggle and Undo → 44 px. Tab labels 11 → 13 px.
5. **Today:** the Ask button covered the ghost guide's Adult toggle. More bottom space added.
6. **Trip Setup and Today** frames were cut off at the bottom. Made taller.

## 3. Decisions (Nov 22)
- **Ghost guide:** plays only while the app is open. OK.
- **Alerts:** by email from the Google script. OK.
- **Build:** web app + Google script, as in section 4. OK.
- **Day shape:** start and end, each with −/+ (15 min steps), suggestion in parentheses, "Custom" tag. Booked tickets keep their time.
- **Downtime:** not a set time. Setup holds on/off and length; each day fits it in like an activity (after lunch when it can), and it can be dragged in Days.
- **Activity Card:** a dialog over the current screen. Closes with the X or a tap outside.

## Open issues
1. **Budget, pace, crowd** segments are drawn as text, not buttons. Fix in the build (real buttons, 44 px).
2. **Swipe to eliminate** needs a second way for accessibility. Suggest the long-press menu also offers "Eliminate".
3. **Docs/passports:** dropped by decision; KAYAK and the phone hold them.

## 4. Build plan (same recipe as the other apps)
**Recommendation: web app (PWA) on GitHub Pages, like Chef Luc.**
- Preact + Vite + TypeScript + `vite-plugin-pwa`. Installable, works offline.
- Every push to `main` tests, builds and publishes (same GitHub Action as Chef Luc).
- Light + dark mode from the tokens above. `?demo` shows a sample Paris trip.
- No family data in this public repo (Control Center rule).

**One private Google Apps Script as the backend**, like the Control Center:
- **Sync** between both parents' phones (trip, list, days) in a private Sheet.
- **Bookings:** reads confirmation emails in Gmail on a timer. Optional KAYAK calendar link.
- **Flight changes:** the same timer spots them and emails you.
- **Gemini:** the key lives in Script Properties (like the Cozi password), not on the phones. Replaces the Cloudflare Worker in the spec: one less service.
- **Walking times:** Apps Script's Maps service.
- **Weather:** Open-Meteo, free, no key (same as Wardrobe COO).

**Phases**
1. Core: Trips, Setup, List, Activity Card, Days, Must-sees. Demo data. Sync.
2. Smart: Ask (Gemini), What now?, rain plan B, bookings from email, leave-by.
3. Snap (camera → Gemini: translate, bill check), Prep, Ghost guide.

## 5. Where to change what (draft, one place each)
| Thing | Change it in |
|---|---|
| Destination, dates, vibe, budget, pace, people, miles | Trip Setup |
| What's picked, undecided, eliminated | List |
| Order within a day | Days |
| Bookings | Gmail / KAYAK (read automatically) |
| Gemini key | Google script (Script Properties) |

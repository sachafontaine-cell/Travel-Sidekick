# Travel Sidekick — Product Spec (handoff to Claude Code)

Status: mockups approved-in-progress. **Do not start coding until Sacha approves.**
Mockups: `mockups/*.dc.html` = source of each screen (design-canvas format; view them rendered at the live canvas link).
Live canvas (comments): https://claude.ai/artifact/R2HUbufL1oXAbEa1k3xzAB

## Purpose
AI travel-agent sidekick used mostly *during* a trip, partly before. Family of 4 (2 adults, kids 10 and 8). Assume the traveler will never return to the destination: **never miss a must-see.**

## Design rules (non-negotiable)
- Each thing is changed in exactly one place; every entry point leads to that same place.
- Don't repeat the same info on multiple tiles/screens unless it clearly helps.
- Every alert, map pin, list row or chat mention opens the same Activity Card.
- Suggestions appear in parentheses next to settings (e.g. "(suggested 4–6 mi/day)").
- Phone-first, concise, readable.

## Navigation
Tabs: **Today · List · Days · Must-sees · Trip**. Floating **Ask** button on tab screens.
Trip tab = Snap screen, with header buttons: Prep · Setup · KAYAK ↗ · All trips.

## Screens (10)
1. **Trips** — Happening now / Upcoming. "+ New trip" → Setup.
2. **Trip Setup** (only settings screen) — destination, dates, bookings found in email; vibe (pick ≤2, weighted); budget per category (lodging/food/activities, $–$$$); pace; people with age → suggested daily miles, each adjustable with −/+ ("Custom" tag); group limit = lowest person; breaks; crowd tolerance; food; schedule shape + downtime; hard nos. Must-sees always included (no toggle).
3. **Today** — Next up + leave-by (traffic + kid buffer); **What now?** card (one best suggestion, energy-aware via pace/steps; buttons: Another idea, Surprise me · 15 min); Handled for you: flight change (rebook via KAYAK link), rain plan B (auto-swap indoor, Undo); compact Ghost guide player (kid/adult, location-triggered).
4. **List** — master list: Picked / Undecided / Eliminated (collapsed). Checkbox, drag handle (☰), swipe left = eliminate, long-press move. Sort (My order, Worth-it, Value, Price, Distance, Must-see first) + filters (Hide traps, Under $X, Near me, Kid-friendly). Undo toast after every move. Must-sees can be pushed down, never eliminated.
5. **Activity Card** — badge (Must-See / Worth It / Depends / Tourist Trap / Hidden Gem); Worth it /10, Value /10 (worth per $ vs similar options), price per person + group; recommendation (Pay for it / Do the cheaper version / Skip — must-sees never Skip); sub-scores /10 (Iconic, Vibe fit, Low hassle, Kid fit); why + tip; Add to day; Ask about this.
6. **Days** — D1–D7 tabs (views of the same master list), drag to reorder, route/time recalculated, walking total vs group limit, rebalance-later-days prompt.
7. **Must-sees** — countdown from Day 1: "5 of 9 done · 4 days left"; status per item (Done, Scheduled, At risk, Last chance); escalating alerts; "Fix it" reshuffle.
8. **Ask** — AI sheet that knows the trip profile, list, countdown, current screen/activity, time, location, weather. Context chips, can propose actions (Apply / Not now) using the same list/day actions. Camera button opens Snap.
9. **Snap** (Trip tab) — one "Snap anything" button, auto-detects: menu (translate + save prices), receipt (check vs saved menu prices, FX traps like dynamic currency conversion, service included), signs/plaques (translate + context). "Show the waiter (in French)". "Split with another family" only when tapped (family vs family: even / headcount / by item). No splitting between spouses.
10. **Prep** — rehearse any day (D1–D7 picker, walkthrough of arrival/transport/meals, likely hiccup highlighted); local rules (closing days, tipping, scams, metro). Sections collapsible.

## Dropped by decision
Journal/memory book, photos, Wallet/docs (KAYAK + phone handle bookings & documents), trip spending total, hotel negotiator, separate Explore screen, in-family bill split.

## Integrations (proposed)
- Bookings: read confirmation emails (Gmail); optional KAYAK Trips calendar feed (ICS link from KAYAK Trips settings). KAYAK has no personal-trips API.
- AI: Gemini free tier (Google AI Studio key, Flash/Flash-Lite) behind a small proxy (e.g. Cloudflare Worker) so the key isn't in page code. Free tier data may be used by Google — never send passport/ID data. Send a compact JSON trip summary + current screen, not the whole DB.
- Weather, maps/routing, place data: TBD.

## Open questions for build
- Platform: web app / PWA on GitHub Pages (like Wardrobe COO) vs native Android.
- Storage and sync between spouses' phones.

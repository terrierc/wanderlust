# Changelog

## 1.1.0
- **Desert Dawn and Desert Midnight themes.** Desert Dawn (light): warm sand, violet ink and sunrise orange. Desert Midnight (dark): black sky, midnight blue, violet haze and ember orange. Both share a night-sky header with a sunrise horizon line.
- **Theme switch and labelled Menu.** The header's Menu button opens Appearance (Auto, Light or Dark, remembered on each device), Trips & money, Your data and App, each item with a one-line description.
- **Deals board in the main navigation**, plus a **Flight deals** button in the header that opens the board and searches straight away.
- **Search flight deals (opt-in).** Mark a fare target "Check it automatically" with dates and travellers, then press **Search flight deals**. Wanderlust asks Google Flights, through SerpApi, for the cheapest price, logs it, and flags a price at or under your target, a drop, a sharp rise, or a fare Google rates as low. It needs `SERPAPI_KEY`, runs only when you press the button, searches each route at most once an hour, and stops at 150 searches a month (`FAREWATCH_MONTHLY_CAP`). Only airport codes, dates and the number of travellers are sent.
- **I Want That Flight** links beside Google Flights and Skyscanner on every route.
- **Spending on the road, with guests.** An "Expense" button on every trip page and on Today works offline: amount, currency, category, date, who paid, who it covers (default: everyone travelling that day), note and a receipt photo. The Money tab shows totals per day, a running total, per person, a daily allowance, and a dated AUD estimate. **Travellers on this trip** (Money tab) chooses who is on a trip and adds guests, who appear only on the trips they join; Settle up names everyone.
- **Emergency tab** on every trip, printable and offline: the Australian 24-hour Consular Emergency Centre, local emergency numbers, Australian missions, your insurance details and where you sleep each night. Country facts live in `plan/emergency.json` with their source and the date they were checked; Türkiye and Egypt are included as examples.
- **Read-only share links.** On a trip's Overview, make a private link for one person. It shows that trip only (route, flights, stays, day plans, the emergency card), opens without signing in, and keeps working offline on their phone. Only a SHA-256 fingerprint of each link is stored. You can set an expiry, revoke or replace a link at any time.
- **Fix:** trip lengths such as "17 days (22 Jan – 8 Feb)" were read using the largest number in the note. They now read 17 days.
- **Fix:** the partner passphrase reads only `WANDERLUST_PASSPHRASE_PARTNER`.

## 1.0.0
- First public template release: private, offline-first travel atlas and trip planner you deploy to your own Netlify site.

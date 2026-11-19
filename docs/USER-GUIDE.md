# Wanderlust: a user guide

**Address:** https://wanderlust-966d4b845f0f.netlify.app. Each of you has your own passphrase, and each device remembers it for 180 days.

## Getting started
1. Open the address and enter your passphrase.
2. Install the app:
   - iPhone: Safari → Share → **Add to Home Screen**. This also stops Safari clearing your data after a week without use, and lets notifications work.
   - Mac: Chrome → the install icon in the address bar.
3. Once installed, Wanderlust opens without a connection. Everything you change saves on the device first and syncs when you're back online. The chip at the top shows the state: Synced, Waiting to sync, Offline, or Needs your decision.

## The main screens
- **Explore:** every place, on the map or as cards or a list.
- **Plan:** a timeline from this month to your target date or your last planned trip. Add any journey to it with “Add to the plan”.
  - Drag a trip, or select it and press ← or →, to move its window.
  - Shading shows when its places are in season.
  - Flags never block anything; they're reminders. They cover seasons, the deadline, unavailable time, leave limits and passports.
  - Further down: unavailable periods, leave, passports, the money roll-up, points, and your calendar link.
- **Journeys:** the eight plan trips, plus your earlier ideas. Each trip has these tabs:
  - **Overview:** the window, the forty places in it, and each leg with who is going. Your partner’s legs start as “maybe”; either of you can change them.
  - **Route:** stops, connections, and prefilled flight searches.
  - **Days**, **Wallet** (bookings and their files) and **Money** (budget, per person, settle up, savings).
  - **Tasks** (including packing lists), **Research** (including the health and entry checklist), **Together** and **Journal**.
  - **The chapter page:** a printable story of the trip, from the Journal tab.
- **The forty:** forty places to see (a starter list you can swap from), optional alternatives and conditional reserves. Set an optional target date in More → Settings.
  - Substituting keeps exactly forty and deletes nothing.
  - Each place shows its trip, its best months and its official links.
- **Travel story:** countries, memories and completed places.
- **Today:** the plan for the day, in big type, with bookings and contacts that work offline.

## Money
- Each cost keeps its own currency.
- **Blank means not decided. 0 means a known zero.**
- Estimates can have low and high figures.
- "Show AUD estimate" converts using European Central Bank rates (free; the rate date is always shown). Currencies without a rate are listed rather than guessed.
- Record who paid and how a cost splits:
  - The default follows the leg: a leg only you travel is yours; a leg your partner has said yes to splits equally.
  - Whole-trip costs ask who they cover.
- **Settle up** shows the fewest transfers needed. Each one stays in the history.

## Spending on the road
- Tap the orange **Expense** button on any trip page or on Today. It works with no connection and syncs later.
- Enter the amount, currency, category, who paid and who it covers. "Who it covers" starts with everyone travelling that day; the cost splits equally between the people ticked. A receipt photo is optional.
- The trip's **Money** tab shows what you spent each day, a running total, each person's share and a daily allowance (from your budget, or the likely estimate). Expenses also flow into **Settle up**.
- **Guests:** on the Money tab, open **Travellers on this trip** to choose who is on the trip or add a guest (a first name is enough). A guest appears only on the trips you add them to.

## Fares
- Use **Flights to watch** on a trip's Route tab to search Google Flights, Skyscanner or I Want That Flight. Log what you find on the **Deals board** and set a target; a route turns green at or below your target.
- **Search flight deals (optional):** on the Deals board, set a target and tick **Check it automatically**, with the date you fly out, a return date if it's a return trip, and the number of travellers. Press **Search flight deals** on the board, or **Flight deals** in the header. Wanderlust checks Google Flights, logs the cheapest price, and flags a price at or under your target, a drop, a sharp rise or a fare Google rates as low.
- Setup, once: create a free SerpApi account, copy its API key, and add it in Netlify as `SERPAPI_KEY`. Searches stop at 150 a month, so it stays free. Each route is searched at most once an hour. Only airport codes, dates and the number of travellers are sent.
- **Stop watching** keeps the target and price history and only stops the checks.

## Emergency card
- Every trip has an **Emergency** tab: the Australian 24-hour Consular Emergency Centre, local emergency numbers and Australian embassies for each country on the trip, your insurance details and where you sleep each night. It works offline and prints.
- Country details come from `plan/emergency.json`, each with its source and the date it was checked. Add your own countries there before you deploy. A country with no stored details says so instead of guessing.

## Sharing a trip
- On a trip's **Overview**, **Share with family** makes a private, read-only link for one person. It shows that trip only: route, flights and connections, where you sleep, day plans and the emergency card. You choose whether to add the insurance policy number, booking references or money.
- Copy the link when it's made: only a fingerprint of it is stored, so it can't be shown again (you can make a replacement). Set an expiry if you want one. **Revoke** stops a link at once.
- The link opens on a phone without signing in and saves itself there, so it keeps working without a signal.

## Documents
More → **Documents** holds passports, visas, insurance and vaccination records, encrypted on that device only. They are never synced, and each device keeps its own. They're included in a backup only if you protect it with a passphrase.

## Appearance
Menu → **Appearance**: Auto (follows your device), Light (Desert Dawn) or Dark (Desert Midnight). Each device remembers its choice.

## Staying in the loop
- **Calendar:** Plan → "Show my calendar link" gives one private link for Google or Apple Calendar. "Replace the link" turns the old one off.
- **Notifications:** More → Settings → "Turn on notifications". You get a reminder the day before and on the day of each key date. On iPhone this needs the Home Screen install first.

## Offline maps
The world map is built in. Download detailed regions in More → Offline & downloads. They are for reference, not turn-by-turn directions.

## Safety and honesty
- Petra, Wadi Rum, Russia and Iran stay conditional or on hold. Wanderlust shows the latest advice link and when you last checked it; it never says a place is safe.
- Best months came from the plan brief and are marked "not yet checked" until you confirm them.

## Backups and devices
- More → **Backup & restore** makes one file with everything, including photos and PDFs. Add a passphrase to encrypt it.
- More → **Data on this device** removes the copy on a shared or lost device.
- To sign one person out everywhere, change that person's passphrase in Netlify (`WANDERLUST_PASSPHRASE` for you, `WANDERLUST_PASSPHRASE_PARTNER` for your partner) and redeploy.

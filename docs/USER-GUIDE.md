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

## Fares
Use **Flights to watch** on a trip's Route tab to search. Log what you find on the **Deals board** (More) and set a target; a route turns green at or below your target.

## Documents
More → **Documents** holds passports, visas, insurance and vaccination records, encrypted on that device only. They are never synced, and each device keeps its own. They're included in a backup only if you protect it with a passphrase.

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

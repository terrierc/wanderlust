# Wanderlust

A private, offline-first travel atlas and trip planner you host yourself, free.

Plan journeys stop by stop and day by day. Track budgets with "blank = not decided, 0 = known zero", split costs with a travel partner, and watch fares. You can also keep a journal and an encrypted documents wallet, and see everything on offline maps. It installs on your phone like an app, works with no signal, and syncs when you're back online.

**Your data is yours.** Each person deploys their own copy, so there is no shared server, no account with anyone else, and no tracking. Your trips live on your device and in your own Netlify site's storage, behind your own passphrase.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/terrierc/wanderlust)

## What's inside

- **Explore:** 123 starter destination ideas, each with a photo (credited, freely licensed), a suggested route and a season. Keep them, edit them or delete them.
- **Journeys:** route and nights, day-by-day plans, connections with real time zones, bookings, a wallet, money, tasks, research with "checked on" dates, and a journal.
- **Plan:** a timeline of your trips with season checks, leave per person, blackout dates and passport-expiry warnings, plus a private calendar feed for Apple or Google Calendar.
- **The forty:** a starter list of forty great places to see, with optional alternatives you can swap in. Set your own target date if you like.
- **Money:** low, likely and high ranges per trip, currency estimates from the free [Frankfurter](https://frankfurter.dev) rates, and shared expenses for two people with settle-up.
- **Deals board:** log fares you see and set a target per route; green means book it.
- **Documents wallet:** passports and tickets encrypted on the device (AES-GCM, non-extractable key), never uploaded.
- **Offline:** installable PWA, offline world map, optional detailed offline map regions (PMTiles).
- **Two people:** an optional second passphrase for a partner, with costs split per leg.
- **Push reminders** for key dates (optional, with your own VAPID keys).

## Set up your own copy (about 10 minutes, free)

1. **Copy the code.** Click **Use this template** (or fork) to make your own repository. It can be private.
2. **Create the site.** In [Netlify](https://app.netlify.com), choose *Add new site → Import an existing project*, then pick your repository. The build settings come from `netlify.toml`, so leave them as they are. (Or use the Deploy button above.)
3. **Set your passphrase.** Under *Site configuration → Environment variables*, add:

   | Variable | Required | What it is |
   |---|---|---|
   | `WANDERLUST_PASSPHRASE` | yes | Your passphrase, 10 or more characters. Until it is set, the site stays locked. |
   | `WANDERLUST_PASSPHRASE_PARTNER` | no | A second passphrase for a travel partner (11 or more characters). |
   | `WANDERLUST_TIMEZONE` | no | For reminders, e.g. `Europe/London`. Default `Australia/Melbourne`. |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | no | For push reminders. Generate them with `npx web-push generate-vapid-keys`. |
   | `SERPAPI_KEY` | no | Turns on **Search flight deals** (Google Flights prices through [SerpApi](https://serpapi.com)). Leave it out and the Deals board still works with your own price log and search links. |
   | `FAREWATCH_MONTHLY_CAP` | no | Most flight searches a month. Default 150, maximum 240, so SerpApi's free plan (250 a month) is never exceeded. |

4. **Deploy** again so the variables take effect, then open your site and sign in.
5. **On your phone,** open the site once, sign in, then *Add to Home Screen*. On iPhone this also stops Safari clearing the data after a week without use.

Netlify's free plan is usually enough for one or two people; check their current limits. Wanderlust uses no paid APIs. Flight-deal searching is opt-in, and capped so it stays inside SerpApi's free plan.

### Make it yours

- **Home airport and names:** Plan → people (used for fare links and leave).
- **Target date for the forty:** More → Settings.
- **Reminder time:** daily at 21:00 UTC by default; change `schedule` in `netlify/functions/reminders.mjs`.
- **Starter content:** `destinations.json` (ideas), `forty.json` (the forty), `plan/forty-plan.json` (best months and official links per place). Edit them before your first deploy, or delete what you don't want in the app.

## Run it locally

```bash
npm install
npm run dev        # http://127.0.0.1:4173 with an in-memory mock store
npm run check      # build plus server, sync, conflict, budget and split checks
npm run e2e        # browser smoke test (Chromium + WebKit; needs `npx playwright install`)
```

To deploy from your computer instead of from GitHub: `npx netlify deploy --build --prod`.

## Privacy and limits

- Access is a shared-secret passphrase per person, not an account system with password reset. Changing a passphrase signs that person out everywhere.
- The device copy is protected by the device and browser profile. Full backups (More → Backup) can be encrypted with a passphrase you choose. A forgotten backup passphrase cannot be recovered.
- Safari and iOS can clear website storage after about seven days without use unless the app is on the Home Screen.
- Offline maps show stop order only. There is no routing or turn-by-turn navigation.
- Travel advice, entry rules and prices change. The app records where and when you checked something, and never treats a guess as a fact.

## Credits and licence

Code: MIT (see `LICENSE`). Destination photos are from Wikimedia Commons and Unsplash under their own licences (CC BY, CC BY-SA, CC0, public domain or Unsplash). Each photo's credit and licence link appear in the app and in `photos-ready.json`. Base map: Natural Earth (public domain). Fonts: Fraunces and Inter (SIL OFL). Map glyphs: Noto Sans (SIL OFL). Optional detailed regions: OpenStreetMap via Protomaps (ODbL).

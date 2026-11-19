# Elsewhere architecture

## Shape

A vanilla-JS single-page app (ES modules, no framework) with a small server. The same code runs in three places:

| Host | Server | Storage | Access |
|---|---|---|---|
| Netlify (current) | `netlify/functions/api.mjs` → `dist/netlify-server/index.mjs` | Netlify Blobs via `server/netlify-bucket.mjs` | Passphrase gate, `netlify/edge-functions/gate.js` |
| Cloudflare Workers (optional) | `worker/index.js` (Cloudflare Worker) | R2 `BUCKET` | your own access control |
| Desktop (`../desktop`, Tauri) | none | that computer only | the computer |

`compile.mjs` builds all three from `src/` and validates the 40-before-40 plan. The build fails if a slot is unassigned or assigned twice.

## Client (`src/`)

- `app.js`: shell, router (History API; routes table at the top), global event delegation (`data-act`, `data-form`, `data-change`, `data-input`), boot, versioned data migrations (`runPlanMigration`), service-worker registration.
- `ui/screens/*.js`: one module per area. Explore, place, journeys (plus the global wallet), trip (tabs), forty, story, today, search, more. Each screen's `render(ctx)` returns `{title, html, mount}`.
- `ui/kit.js`: escaping, icons, form fields. `formValues()` keeps blank numbers as `null` (unknown) and `0` as a known zero.
- `ui/map.js`: MapLibre with a bundled Natural Earth overview, plus PMTiles regions read from IndexedDB blobs.
- `core/model.js`: the data model, shared verbatim with the server. Validators, entity addressing, and `applyOp`, which is idempotent by value and detects conflicts against `base` values.
- `core/store.js`: the local source of truth. An in-memory entity map backed by IndexedDB. Every edit is one transaction: entity plus outbox operation.
- `core/sync.js`: uploads files, pushes the outbox (`/api/sync/push`), pulls (`/api/sync/pull`), replays unsent operations, and records conflicts ("Decisions waiting"). Retries with backoff and detects expired sign-in.
- `core/plan.js`: the six-year plan. Validation, season and deadline checks, and idempotent migration operations.
- `core/backup.js`, `core/exports.js`, `core/search.js`, `core/files.js`, `core/domain.js`, `offline.js` (download manager).
- `sw.js`: versioned shell cache. Navigations are served cache-first from the shell; `/api`, `/mcp` and map archives are never cached. A new version waits for "Restart to update".

## Data

- **Saved documents.** These stay compatible with the original Sites layout:
  - `atlas/<id>.json`: place overrides and tombstones.
  - `profile/travel-v1.json`: countries, plus trips with their costs and tasks.
  - `workspace/hub-v1.json`: records by kind, including `segments` (trip legs) and `people`.
  - `collection/forty-v1.json`: selection, personal notes (including `tripId`) and extras.
  - `settings/app-v1.json`, `documents/<id>`, `meta/space.json`, and `sync/ops/<opId>.json` (the idempotency ledger).
- **Entities on the device.** These are kinds addressed `kind:id`:
  - `place`, `country`, `trip`, `cost`, `task`
  - the hub kinds
  - `fortyEntry`, `fortyExtra`, `fortySelection`, `setting`
- **Operations.** These are `create`, `patch` (with `base` values), `delete` (with `base`) and `swap`. "Not set" and `null` count as the same value.

## IndexedDB (one database per data space)

Stores: `entities`, `outbox`, `conflicts`, `files`, `maps`, `mapChunks`, `meta`, `packs`. Schema migrations live in `core/db.js` (`MIGRATIONS`). Data migrations are idempotent operation sets that sync like any edit; Phase 1's is marked by the setting `planLoaded`.

## Tests

- `scripts/check.mjs`: server, sync, migrations (against snapshots of the real data) and the plan.
- `scripts/e2e.mjs`: 23 browser steps, including offline, reconnect, conflicts and 375/390px layouts.
- `scripts/netlify-smoke.mjs`: the gate and storage on the Netlify runtime.

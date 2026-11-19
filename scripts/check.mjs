// Server, data-model and export checks. Run after `node compile.mjs`.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import worker from '../worker/index.js';
import * as M from '../src/core/model.js';
import { Store } from '../src/core/store.js';
import { costTotals, legDuration, staleness, fortyModel, countryMatch } from '../src/core/domain.js';
import { calendarICS, workbookXML, offlineTripHTML, planImport } from '../src/core/exports.js';

const origin = 'https://atlas.test';
const ok = (label) => console.log('✓', label);
function bucket() {
  const m = new Map(); let rev = 0;
  const o = (k, x, body = x.body) => ({ key: k, size: x.body.length, etag: x.etag, httpEtag: x.httpEtag, httpMetadata: x.httpMetadata, customMetadata: x.customMetadata, body, json: async () => JSON.parse(Buffer.from(x.body).toString()), text: async () => Buffer.from(x.body).toString() });
  return {
    m, failNext: 0,
    async list({ prefix = '' } = {}) { return { objects: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
    async head(k) { const x = m.get(k); return x ? o(k, x, null) : null; },
    async get(k, opts = {}) { const x = m.get(k); if (!x) return null; return opts.range ? o(k, x, x.body.subarray(opts.range.offset, opts.range.length ? opts.range.offset + opts.range.length : undefined)) : o(k, x); },
    async put(k, v, opts = {}) { if (this.failNext > 0) { this.failNext--; throw new Error('fail'); } const old = m.get(k); if (opts.onlyIf && ((opts.onlyIf.etagMatches && opts.onlyIf.etagMatches !== old?.etag) || (opts.onlyIf.etagDoesNotMatch === '*' && old))) return null; const etag = 'e' + (++rev); m.set(k, { body: Buffer.from(typeof v === 'string' ? v : new Uint8Array(v)), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata, etag, httpEtag: '"' + etag + '"' }); return { etag, httpEtag: '"' + etag + '"' }; },
    async delete(k) { m.delete(k); },
  };
}
const call = (B, p, method = 'GET', body, headers = {}) => worker.fetch(new Request(origin + p, { method, headers: { Origin: origin, ...headers }, ...(body !== undefined ? { body } : {}) }), { BUCKET: B });
// A small fictional profile for tests (the template itself ships with an empty one).
const EXAMPLE_PROFILE = { schemaVersion: 1, countries: [{ code: 'IS', name: 'Iceland', region: 'Europe', lat: 64.9, lon: -19, status: 'Visited', revisit: false, notes: '', source: 'Example' }], trips: [{ id: 'stans', name: 'Example: the Stans', status: 'Idea', stops: [], costs: [], tasks: [{ text: 'Check visas', done: false }] }, { id: 'iran', name: 'Example: on hold', status: 'On hold', notes: 'Only when safe.', stops: [], costs: [], tasks: [] }] };
const backup = JSON.parse(await fs.readFile('../backups/2026-11-18-runtime-full.json', 'utf8').catch(() => 'null'));
const catalogue = JSON.parse(await fs.readFile('destinations.json', 'utf8')), FORTY = JSON.parse(await fs.readFile('forty.json', 'utf8'));

// ---------- shell, assets, offline bundle ----------
{
  const r = await worker.fetch(new Request(origin + '/journeys/stans/days'), {});
  assert.equal(r.status, 200); const html = await r.text();
  assert.match(r.headers.get('Content-Security-Policy'), /connect-src 'self'/);
  assert(!/https?:\/\/(unpkg|cdn|tile\.openstreetmap|fonts\.googleapis)/.test(html), 'no remote runtime dependencies in the shell');
  const cfg = JSON.parse(html.match(/id="elsewhere-config">([^<]+)</)[1]);
  const sw = await (await worker.fetch(new Request(origin + '/sw.js'), {})).text();
  const precache = JSON.parse(sw.match(/const PRECACHE = (\[.*?\]);/)[1]);
  for (const u of precache) { const a = await worker.fetch(new Request(origin + u), {}); assert.equal(a.status, 200, u); const body = await a.text(); assert(!/https?:\/\/(unpkg\.com|tile\.openstreetmap\.org|fonts\.g)/.test(body) || u.includes('maplibre-gl.js'), 'remote URL inside ' + u); }
  for (const need of ['vendor/maplibre-gl.js', 'vendor/pmtiles.js', 'maps/land.geojson', 'maps/countries.geojson', 'sprites/light.json', 'sprites/light@2x.png', 'fonts/Noto%20Sans%20Regular/0-255.pbf', 'fonts/fraunces-latin-wght-normal.woff2', 'icons/icon-512.png', 'data/seed.json']) assert(precache.includes(cfg.assetBase + need), 'precached ' + need);
  const man = JSON.parse(await (await worker.fetch(new Request(origin + '/manifest.webmanifest'), {})).text());
  assert.equal(man.start_url, '/?source=app'); assert.equal(man.scope, '/'); assert.equal(man.display, 'standalone'); assert(man.icons.some(i => i.purpose === 'maskable'));
  assert.equal((await worker.fetch(new Request(origin + '/nonsense'), {})).status, 404);
  ok('Shell, deep-link routes, CSP, manifest and ' + precache.length + ' precached local assets (no CDN, no OSM tiles)');
}

// ---------- legacy API compatibility (earlier clients and MCP keep working) ----------
{
  const B = bucket(), p = catalogue[0];
  assert.equal((await call(B, '/api/place/' + p.id, 'PUT', JSON.stringify(p))).status, 200);
  assert.deepEqual(await (await call(B, '/api/state')).json(), [p]);
  assert.equal((await call(B, '/api/place/' + p.id, 'PUT', JSON.stringify(p), { Origin: 'https://other.test' })).status, 403);
  assert.equal((await call(B, '/api/place/' + p.id, 'PUT', JSON.stringify(p), { 'If-Match': '"stale"' })).status, 409, 'place writes now have conflict protection');
  const profile = await (await call(B, '/api/profile')).json();
  assert.equal(profile.countries.length, 0, 'the template starts with no travel history');
  const h = await call(B, '/api/hub'), hub = await h.json(); hub.records.days.push({ id: 'day-one', trip: 'stans', date: '2027-06-01', title: 'Arrival' });
  const weak = 'W/' + h.headers.get('ETag');
  assert.equal((await call(B, '/api/hub', 'PUT', JSON.stringify(hub), { 'If-Match': weak })).status, 200, 'weak ETag from a compressing proxy is accepted');
  assert.equal((await call(B, '/api/hub', 'PUT', JSON.stringify(hub), { 'If-Match': '"empty"' })).status, 409);
  const f0 = await call(B, '/api/forty'), f = await f0.json(); f.selection[18] = 'optional-sardinia';
  assert.equal((await call(B, '/api/forty', 'PUT', JSON.stringify(f), { 'If-Match': 'W/' + f0.headers.get('ETag') })).status, 200);
  const bad = structuredClone(f); bad.selection[0] = 'not-a-real-entry'; assert.equal((await call(B, '/api/forty', 'PUT', JSON.stringify(bad), { 'If-Match': (await call(B, '/api/forty')).headers.get('ETag') })).status, 400);
  assert.equal((await call(B, '/api/document/test-pdf', 'PUT', '<script>', { 'Content-Type': 'application/pdf' })).status, 400);
  assert.equal((await call(B, '/api/document/test-pdf', 'PUT', '%PDF-1.4 x', { 'Content-Type': 'application/pdf', 'X-Content-SHA256': 'a'.repeat(64) })).status, 422, 'damaged upload rejected');
  const sha = createHash('sha256').update('%PDF-1.4 x').digest('hex');
  assert.equal((await call(B, '/api/document/test-pdf', 'PUT', '%PDF-1.4 x', { 'Content-Type': 'application/pdf', 'X-Content-SHA256': sha })).status, 200);
  const d = await call(B, '/api/document/test-pdf'); assert.equal(d.headers.get('X-Content-SHA256'), sha); assert.equal(d.headers.get('Cache-Control'), 'private,no-store');
  await B.put('profile/travel-v1.json', JSON.stringify({ schemaVersion: 1, countries: [], trips: [{ id: 'stans', name: 'Example trip', status: 'Idea', stops: [], costs: [], tasks: [] }] }));
  const rpc = async (method, params) => (await (await worker.fetch(new Request(origin + '/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), { BUCKET: B })).json()).result;
  const w = JSON.parse((await rpc('tools/call', { name: 'get_travel_workspace', arguments: {} })).content[0].text);
  assert.equal(w.hub.records.days[0].title, 'Arrival'); assert(Array.isArray(w.hub.records.requests)); assert.equal(w.forty.selection.selection[18], 'optional-sardinia');
  const saved = await rpc('tools/call', { name: 'save_researched_trip_records', arguments: { trip: 'stans', etag: 'W/' + w.etag, research: [{ id: 'r1', trip: 'stans', title: 'T', url: 'https://example.com', checked: '2026-11-16', notes: 'n' }] } });
  assert(!saved.isError, saved.content?.[0]?.text);
  ok('Legacy routes, origin checks, weak-ETag fix, place conflict protection, document integrity and MCP tools');
}

// ---------- operation sync: idempotency, conflicts, tombstones ----------
{
  const B = bucket();
  await B.put('profile/travel-v1.json', JSON.stringify(EXAMPLE_PROFILE));
  const push = async ops => (await (await call(B, '/api/sync/push', 'POST', JSON.stringify({ ops }), { 'Content-Type': 'application/json' })).json());
  const pull = async () => (await call(B, '/api/sync/pull')).json();
  const s0 = await pull(); assert.match(s0.space, /^space-/); assert.equal((await pull()).space, s0.space, 'stable data space');
  assert.equal(s0.places.length, 123); assert.equal(s0.profile.trips[0].tasks[0].id, 'stans-task-0', 'tasks gain deterministic stable IDs');
  const op = { opId: 'op-0001-aaaa', at: '2026-11-18T00:00:00Z', kind: 'place', id: 'd001', action: 'patch', set: { notes: 'Midnight sun' }, base: { notes: '' } };
  assert.equal((await push([op])).results[0].status, 'applied');
  assert.equal((await push([op])).results[0].status, 'duplicate', 'replayed operation is not applied twice');
  const stale = { ...op, opId: 'op-0002-bbbb', set: { notes: 'Polar night' }, base: { notes: '' } };
  const c = (await push([stale])).results[0]; assert.equal(c.status, 'conflict'); assert.equal(c.current.notes, 'Midnight sun');
  const cost = { opId: 'op-0003-cccc', kind: 'cost', id: 'cost-a', parent: 'stans', action: 'create', entity: { id: 'cost-a', item: 'Guide', total: null, paid: 0, currency: 'KGS', basis: 'per person', myShare: null } };
  assert.equal((await push([cost])).results[0].status, 'applied');
  const neg = { opId: 'op-0004-dddd', kind: 'cost', id: 'cost-a', parent: 'stans', action: 'patch', set: { total: -5 }, base: { total: null } };
  assert.equal((await push([neg])).results[0].status, 'rejected', 'invalid values are rejected server-side');
  const s1 = await pull(), ct = s1.profile.trips.find(t => t.id === 'stans').costs.find(x => x.id === 'cost-a');
  assert.equal(ct.total, null); assert.equal(ct.paid, 0, 'unknown and genuine zero stay distinct');
  const del = { opId: 'op-0005-eeee', kind: 'place', id: 'custom-x', action: 'create', entity: { id: 'custom-x', name: 'Test', country: 'X', region: 'Other', lat: 1, lon: 1, nights: 3, route: [] } };
  await push([del]); await push([{ opId: 'op-0006-ffff', kind: 'place', id: 'custom-x', action: 'delete', base: del.entity }]);
  const s2 = await pull(); assert(s2.places.find(p => p.id === 'custom-x').deleted, 'deletion leaves a tombstone');
  assert(!(await (await call(B, '/api/state')).json()).some(p => p.id === 'custom-x'), 'legacy reads hide tombstones');
  // seed never overwrites saved records
  assert.equal(s2.places.find(p => p.id === 'd001').notes, 'Midnight sun');
  // forty swap keeps exactly forty and keeps both entries
  const sw = { opId: 'op-0007-gggg', kind: 'fortySelection', id: 'selection', action: 'swap', out: 'forty-19', in: 'optional-sardinia' };
  assert.equal((await push([sw])).results[0].status, 'applied'); assert.equal((await push([{ ...sw, opId: 'op-0008-hhhh' }])).results[0].status, 'duplicate');
  const s3 = await pull(); assert.equal(s3.forty.selection.length, 40); assert(s3.forty.selection.includes('optional-sardinia')); assert(!s3.forty.selection.includes('forty-19'));
  const bad = { opId: 'op-0009-iiii', kind: 'fortySelection', id: 'selection', action: 'swap', out: 'forty-01', in: 'not-a-real-entry' };
  assert.equal((await push([bad])).results[0].status, 'rejected', 'unknown entries cannot enter the forty');
  // concurrent writer race: another write lands between read and write
  const realPut = B.put.bind(B); let raced = false;
  B.put = async (k, v, o) => { if (!raced && k === 'profile/travel-v1.json') { raced = true; await realPut(k, JSON.stringify({ ...JSON.parse(B.m.get(k) ? Buffer.from(B.m.get(k).body).toString() : JSON.stringify((await pull()).profile)) })); } return realPut(k, v, o); };
  assert.equal((await push([{ opId: 'op-0010-jjjj', kind: 'trip', id: 'iran', action: 'patch', set: { notes: 'Still only when safe.' }, base: { notes: s3.profile.trips.find(t => t.id === 'iran').notes } }])).results[0].status, 'applied', 'retries after a lost compare-and-swap race');
  B.put = realPut;
  assert.equal((await pull()).profile.trips.find(t => t.id === 'iran').status, 'On hold');
  ok('Sync: stable space, idempotent replays, conflicts, validation, tombstones, seed safety, forty swaps and CAS retry');
}

// ---------- hosted map regions: upload integrity, catalogue and range reads ----------
{
  const B = bucket(), bytes = await fs.readFile('../vendor-src/regions/ningaloo.pmtiles').catch(() => null);
  if (bytes) {
    const sha = createHash('sha256').update(bytes).digest('hex'), info = { name: 'Ningaloo', bounds: [113.4, -23.4, 114.4, -21.7], minzoom: 0, maxzoom: 13, sha256: sha };
    assert.equal((await call(B, '/maps/ningaloo.pmtiles', 'PUT', bytes, { 'X-Region': encodeURIComponent(JSON.stringify({ ...info, sha256: 'b'.repeat(64) })) })).status, 422, 'damaged region upload rejected');
    assert.equal((await call(B, '/maps/fake.pmtiles', 'PUT', Buffer.from('not a map'), { 'X-Region': encodeURIComponent(JSON.stringify(info)) })).status, 400);
    assert.equal((await call(B, '/maps/ningaloo.pmtiles', 'PUT', bytes, { 'X-Region': encodeURIComponent(JSON.stringify(info)) })).status, 200);
    const cat = await (await call(B, '/api/maps')).json(); assert.equal(cat.regions[0].sha256, sha); assert.equal(cat.regions[0].bytes, bytes.length);
    const part = await call(B, '/maps/ningaloo.pmtiles', 'GET', undefined, { Range: 'bytes=0-6' }); assert.equal(part.status, 206); assert.equal(Buffer.from(await part.arrayBuffer()).toString(), 'PMTiles');
    ok('Map regions: upload integrity, catalogue entry and HTTP range reads');
  }
}

// ---------- the same sync running on the Netlify Blobs adapter ----------
{
  const { netlifyBucket } = await import('../server/netlify-bucket.mjs');
  const lite = (await import('../dist/netlify-server/index.mjs')).default;
  const m = new Map(); let n = 0;
  const fake = { // mirrors @netlify/blobs semantics: conditional set returns { modified, etag }
    async list({ prefix }) { return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key, etag: m.get(key).etag })) }; },
    async getMetadata(k) { const x = m.get(k); return x ? { etag: x.etag, metadata: x.metadata } : null; },
    async getWithMetadata(k) { const x = m.get(k); return x ? { data: x.data.buffer.slice(x.data.byteOffset, x.data.byteOffset + x.data.byteLength), etag: x.etag, metadata: x.metadata } : null; },
    async set(k, data, o = {}) { const x = m.get(k); if ((o.onlyIfNew && x) || (o.onlyIfMatch && o.onlyIfMatch !== x?.etag)) return { modified: false }; const etag = '"b' + (++n) + '"'; m.set(k, { data: new Uint8Array(data), etag, metadata: o.metadata }); return { modified: true, etag }; },
    async delete(k) { m.delete(k); },
  };
  const B = netlifyBucket(fake), go = (p, method = 'GET', body, headers = {}) => lite.fetch(new Request(origin + p, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, ...(body ? { body } : {}) }), { BUCKET: B });
  const s0 = await (await go('/api/sync/pull')).json(); assert.equal(s0.places.length, 123);
  const op = { opId: 'nl-0001-aaaa', kind: 'place', id: 'd001', action: 'patch', set: { notes: 'N' }, base: { notes: '' } };
  assert.equal((await (await go('/api/sync/push', 'POST', JSON.stringify({ ops: [op] }))).json()).results[0].status, 'applied');
  assert.equal((await (await go('/api/sync/push', 'POST', JSON.stringify({ ops: [op] }))).json()).results[0].status, 'duplicate');
  assert.equal((await (await go('/api/sync/push', 'POST', JSON.stringify({ ops: [{ ...op, opId: 'nl-0002-bbbb', set: { notes: 'X' } }] }))).json()).results[0].status, 'conflict');
  const pdf = '%PDF-1.4 netlify'; const sha = createHash('sha256').update(pdf).digest('hex');
  assert.equal((await go('/api/document/doc-1', 'PUT', pdf, { 'Content-Type': 'application/pdf', 'X-Content-SHA256': sha })).status, 200);
  assert.equal((await go('/api/document/doc-1')).headers.get('X-Content-SHA256'), sha);
  assert(Array.isArray((await (await go('/api/maps')).json()).regions));
  ok('Same sync, conflict and document rules on the Netlify Blobs adapter');
}

// ---------- collection integrity ----------
{
  assert.equal(FORTY.entries.length, 48); assert.equal(FORTY.entries.filter(e => e.group === 'core').length, 40);
  for (const [g, n] of [['optional', 6], ['conditional', 2]]) assert.equal(FORTY.entries.filter(e => e.group === g).length, n);
  for (const e of FORTY.entries) assert(catalogue.some(p => p.id === e.placeId), e.id + ' links to a planner');
  const nin = FORTY.entries.find(e => e.name === 'Ningaloo Reef'); assert.equal(catalogue.find(p => p.id === nin.placeId).name, 'Ningaloo Reef'); assert.notEqual(nin.placeId, 'd044');
  const moo = FORTY.entries.find(e => e.name === 'Moorea'); assert.equal(catalogue.find(p => p.id === moo.placeId).name, 'Moorea'); assert.notEqual(catalogue.find(p => p.id === moo.placeId).name, 'Bora Bora');
  for (const n of ['Petra', 'Wadi Rum']) assert(FORTY.entries.find(e => e.name.startsWith(n)).conditional);
  ok('All 48 collection entries linked; Ningaloo ≠ Great Barrier Reef; Moorea ≠ Bora Bora; Petra and Wadi Rum conditional');
}

// ---------- client store, domain rules and exports (in-memory) ----------
{
  const fakeDb = { all: async () => [], tx: async (s, m, fn) => fn({ entities: { clear() {}, put() {}, del() {} }, meta: { put() {} }, outbox: { add() {} } }), put: async () => {} };
  const store = new Store(fakeDb, { space: 'test', localOnly: true });
  await store.replaceFrom({ places: catalogue, profile: structuredClone(EXAMPLE_PROFILE), hub: null, forty: { version: 1, selection: FORTY.entries.filter(e => e.group === 'core').map(e => e.id) }, settings: { version: 1, values: {} } }, { seeded: true });
  await store.create('cost', { id: 'c1', item: 'Yurt', total: 0, paid: 0, currency: 'KGS' }, 'stans');
  await store.create('cost', { id: 'c2', item: 'Flights', total: null, paid: null, currency: 'AUD' }, 'stans');
  await store.create('bookings', { id: 'b1', trip: 'stans', title: 'Yurt camp <b>', costId: 'c1', date: '2027-06-02', cancellation: '2027-05-01' });
  const tot = costTotals(store.list('cost', 'stans'));
  assert.deepEqual(tot.map(t => [t.currency, t.known, t.unknown]), [['KGS', 0, 0], ['AUD', 0, 1]], 'zero is known; blank is unknown; currencies are not mixed');
  assert.equal(legDuration({ date: '2027-06-01', departTime: '23:00', departTz: 'Australia/Melbourne', arriveDate: '2027-06-01', arriveTime: '19:30', arriveTz: 'America/Los_Angeles' }), 13.5, 'date-line crossing measured in real hours');
  assert.equal(staleness({ checked: '2024-01-01' }, '2026-11-18'), 'Checked over a year ago');
  const f = fortyModel(store, FORTY); assert.equal(f.selection.length, 40); assert.equal(f.done, 0);
  await store.swap('forty-05', 'optional-skye'); const f2 = fortyModel(store, FORTY);
  assert.equal(f2.selection.length, 40); assert.equal(f2.groupOf(FORTY.entries.find(e => e.id === 'forty-05')), 'optional');
  assert(countryMatch({ country: 'England' }, { code: 'GB-ENG' }) && !countryMatch({ country: 'United Kingdom' }, { code: 'GB-ENG' }), 'England visit never covers the whole UK');
  const ics = calendarICS(store, 'stans').body; assert.match(ics, /Free cancellation ends/); assert(!ics.includes('undefined'));
  const html = offlineTripHTML(store, 'stans'); assert(html.includes('&lt;b&gt;') && !html.includes('<b>'));
  const xml = workbookXML(store, FORTY, fortyModel); assert.match(xml, /Worksheet ss:Name="Costs"/); assert(!xml.includes('Yurt camp <b>'));
  const plan = planImport(store, backup?.profile.body || JSON.parse(await fs.readFile('profile-seed.json', 'utf8')));
  assert(plan.ops.every(o => o.kind !== 'country' || o.action !== 'delete'), 'imports never delete');
  ok('Local store, unknown-versus-zero costs, time zones, research staleness, forty swaps, exports and import planning');
}
// ---------- Phase 1: the six-year plan, migrated onto a snapshot of the real data ----------
// ---------- Phase 2: leave, blackouts, passport, calendar feed ----------
// ---------- Phase 3: budgets, ranges, AUD estimates, savings ----------
{
  const Bu = await import('../src/core/budget.js');
  const costs = [{ item: 'Flights', currency: 'AUD', total: 4000, low: 3200, high: 5200, state: 'estimate' }, { item: 'Gorilla permits', currency: 'USD', total: 3000, state: 'quoted' }, { item: 'Safari', currency: 'KGS', total: 50000, state: 'estimate' }, { item: 'Visa', currency: 'USD', total: null }, { item: 'Park', currency: 'AUD', total: 0, state: 'paid', paid: 0 }];
  const t = Bu.rangeTotals(costs), aud = t.find(x => x.currency === 'AUD'), usd = t.find(x => x.currency === 'USD');
  assert.deepEqual([aud.low, aud.likely, aud.high, aud.unknown], [3200, 4000, 5200, 0], 'ranges; a genuine 0 adds nothing but is known');
  assert.deepEqual([usd.likely, usd.unknown], [3000, 1], 'blank stays unknown');
  const conv = Bu.toAUD(t, { rates: { USD: 0.65 } });
  assert.equal(Math.round(conv.likely), Math.round(4000 + 3000 / 0.65)); assert.deepEqual(conv.missing, ['KGS'], 'currency without a rate is reported, not guessed'); assert.equal(conv.unknown, 1);
  assert.equal(Bu.monthsUntil('2028-07', '2026-11'), 20);
  // rates endpoint: cached, stale fallback, no user data sent
  const B = bucket(), realFetch = globalThis.fetch; let calls = 0, sentTo = '';
  globalThis.fetch = async (u) => { calls++; sentTo = String(u); return new Response(JSON.stringify({ date: '2026-11-18', rates: { USD: 0.65, EUR: 0.61 } }), { headers: { 'Content-Type': 'application/json' } }); };
  const r1 = await (await call(B, '/api/rates')).json(); assert.equal(r1.rates.USD, 0.65); assert.match(r1.source, /European Central Bank/);
  await call(B, '/api/rates'); assert.equal(calls, 1, 'cached for 12 hours'); assert.equal(sentTo, 'https://api.frankfurter.dev/v1/latest?base=AUD', 'only the base currency is sent');
  const old = JSON.parse(Buffer.from(B.m.get('meta/rates.json').body).toString()); old.fetched = '2020-01-01T00:00:00Z'; await B.put('meta/rates.json', JSON.stringify(old));
  globalThis.fetch = async () => { throw new Error('offline'); };
  const r2 = await (await call(B, '/api/rates')).json(); assert.equal(r2.stale, true); assert.equal(r2.rates.USD, 0.65);
  globalThis.fetch = realFetch;
  ok('Phase 3: low–likely–high ranges, unknown vs zero, AUD estimate with missing-rate reporting, cached and stale rates');
}
// ---------- Phase 4: shared expenses ----------
{
  const Sh = await import('../src/core/shared.js'), P = await import('../src/core/plan.js');
  const plan = JSON.parse(await fs.readFile('plan/forty-plan.json', 'utf8'));
  plan.trips = [{ id: 'plan-north-2027', name: 'Example: the north', kind: 'Anchor', window: ['2027-07', '2027-08'], length: '4 weeks', slots: ['forty-06'], aliases: [], partner: [{ option: 'A', title: 'Example leg', length: '2 weeks', flyIn: 'Reykjavík (KEF)', flyOut: 'Reykjavík (KEF)', slots: ['forty-06'] }], notes: '', keyDates: [] }];
  const fakeDb = { all: async () => [], tx: async (s, m, fn) => fn({ entities: { clear() {}, put() {}, del() {} }, meta: { put() {} }, outbox: { add() {} } }), put: async () => {} };
  const st = new Store(fakeDb, { space: 's', localOnly: true });
  await st.replaceFrom({ places: catalogue, profile: structuredClone(EXAMPLE_PROFILE), hub: null, forty: { version: 1, selection: FORTY.entries.filter(e => e.group === 'core').map(e => e.id) }, settings: { version: 1, values: {} } }, { seeded: true });
  await st.commit(P.planOps(st, plan, FORTY));
  const T = 'plan-north-2027';
  const mk = async (id, x) => st.create('cost', { id, item: id, currency: 'AUD', state: 'paid', ...x }, T);
  await mk('c-solo', { total: 900, paid: 900, paidBy: 'me', segmentId: T + '-me', split: 'leg' });
  await mk('c-vicleg', { total: 600, paid: 600, paidBy: 'me', segmentId: T + '-partner-a', split: 'leg' });
  await mk('c-trip', { total: 300, paid: 300, paidBy: 'partner', split: '' });
  assert.deepEqual(Sh.owed(st, st.get('cost', 'c-solo')), { me: 900, partner: 0 }, 'You-only leg is Your alone');
  assert.deepEqual(Sh.owed(st, st.get('cost', 'c-vicleg')), { me: 600, partner: 0 }, 'Partner “maybe” is not assumed to share');
  await st.patch('segments', T + '-partner-a', { partner: 'yes' });
  assert.deepEqual(Sh.owed(st, st.get('cost', 'c-vicleg')), { me: 300, partner: 300 }, 'a leg Partner joins splits equally');
  assert.equal(Sh.owed(st, st.get('cost', 'c-trip')), null, 'whole-trip cost asks who it covers');
  assert.equal(Sh.owed(st, { total: 100, split: 'exact', shareMe: 60, sharePartner: 30 }), null, 'exact amounts must add up');
  assert.deepEqual(Sh.owed(st, { total: 100, split: 'shares', shareMe: 3, sharePartner: 1 }), { me: 75, partner: 25 });
  const trip = [st.get('trip', T)]; let b = Sh.balances(st, trip);
  assert.equal(b.undecided.length, 1); assert.deepEqual(Sh.transfers(b.by), [{ from: 'partner', to: 'me', amount: 300, currency: 'AUD' }]);
  await st.patch('cost', 'c-trip', { split: 'equal' }, T); b = Sh.balances(st, trip);
  assert.deepEqual(Sh.transfers(b.by), [{ from: 'partner', to: 'me', amount: 150, currency: 'AUD' }], 'Partner paid 300 shared: she owes 300 - 150 = 150');
  await st.create('settlements', { id: 'set-1', trip: T, from: 'partner', to: 'me', amount: '150', currency: 'AUD', date: '2027-09-01', paidAs: '', done: true });
  assert.deepEqual(Sh.transfers(Sh.balances(st, trip).by), [], 'settled; history kept'); assert.equal(st.list('settlements').length, 1);
  ok('Phase 4: splits follow the leg, “maybe” is never assumed, trip-wide costs ask, exact amounts checked, fewest transfers, settlement history');
}
// ---------- Phase 5: fares, targets, official links, key dates ----------
{
  const F = await import('../src/core/fares.js'), P = await import('../src/core/plan.js');
  const plan = JSON.parse(await fs.readFile('plan/forty-plan.json', 'utf8'));
  assert.equal(F.iata('Reykjavík (KEF)'), 'KEF'); assert.equal(F.iata('Melbourne'), '');
  const links = F.fareLinks('MEL', 'KEF', '2027-07-01', '2027-07-20', 2);
  assert.match(links[0].url, /^https:\/\/www\.google\.com\/travel\/flights\?q=.*2027-07-01.*2%20adults/); assert.equal(links[1].url, 'https://www.skyscanner.com.au/transport/flights/mel/kef/270701/270720/?adults=2');
  for (const [id, ls] of Object.entries(plan.officialLinks)) for (const l of ls) { assert.match(l.url, /^https:\/\//); assert(l.authority && l.checked, id + ' link has authority and checked date'); }
  for (const id of ['forty-33', 'forty-18', 'forty-16']) assert(!plan.officialLinks[id] && plan.linkTasks.some(x => x.entry === id), id + ' unverified: blank with a task');
  plan.trips = [{ id: 'plan-north-2027', name: 'Example: the north', kind: 'Anchor', window: ['2027-07', '2027-08'], length: '4 weeks', slots: ['forty-06'], aliases: [], partner: [], notes: '', keyDates: [] }, { id: 'plan-andes-2031', name: 'Example: the Andes', kind: 'Anchor', window: ['2031-06', '2031-08'], length: '6 weeks', slots: ['forty-21'], aliases: [], partner: [], notes: '', keyDates: [] }];
  const fakeDb = { all: async () => [], tx: async (s, m, fn) => fn({ entities: { clear() {}, put() {}, del() {} }, meta: { put() {} }, outbox: { add() {} } }), put: async () => {} };
  const st = new Store(fakeDb, { space: 'f', localOnly: true });
  await st.replaceFrom({ places: catalogue, profile: structuredClone(EXAMPLE_PROFILE), hub: null, forty: { version: 1, selection: FORTY.entries.filter(e => e.group === 'core').map(e => e.id) }, settings: { version: 1, values: {} } }, { seeded: true });
  await st.commit(P.planOps(st, plan, FORTY)); await st.commit(P.phase5Ops(st, plan)); assert.equal(P.phase5Ops(st, plan).length, 0, 'phase 5 migration runs once');
  assert.equal(st.get('reminders', 'plan-north-2027-fares').date, '2026-08-01', 'fare watching 11 months before July 2027');
  assert(st.get('reminders', 'plan-andes-2031-permit-forty-21'), 'Machu Picchu permit key date');
  await st.create('fareTargets', { id: 'tg', trip: '', route: 'MEL-KEF', price: '1800', currency: 'AUD' });
  await st.create('fares', { id: 'f1', trip: '', route: 'MEL-KEF', price: '2100', currency: 'AUD', seenOn: '2026-12-01', travelDates: '', airline: '', url: '' });
  assert.equal(F.routeStats(st, 'MEL-KEF').good, false);
  await st.create('fares', { id: 'f2', trip: '', route: 'MEL-KEF', price: '1750', currency: 'AUD', seenOn: '2027-01-10', travelDates: '', airline: '', url: '' });
  const rs = F.routeStats(st, 'MEL-KEF'); assert.equal(rs.good, true); assert.equal(rs.lowest.price, '1750');
  ok('Phase 5: prefilled fare searches, verified official links (blanks become tasks), fare and permit key dates, targets turn green');
}
console.log('All checks passed.');

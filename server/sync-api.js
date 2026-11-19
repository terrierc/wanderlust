// Operation-based synchronisation for offline-first clients.
// Containers stay in their established R2 objects so the MCP tools, exports and older clients keep working.
const SETTINGS_EMPTY = { version: 1, values: {} };
const normEtag = s => String(s || '').replace(/^W\//, '');
const etagOf = o => o?.httpEtag || '"empty"';
const SYNC_KEYS = { profile: 'profile/travel-v1.json', hub: 'workspace/hub-v1.json', forty: 'collection/forty-v1.json', settings: 'settings/app-v1.json' };

async function readJSON(env, key) { const o = await env.BUCKET.get(key); return o ? { body: await o.json(), etag: o.etag, httpEtag: o.httpEtag } : null; }

async function loadPlaceRecords(env) {
  let cursor, objects = [];
  do { const p = await env.BUCKET.list({ prefix: 'atlas/', cursor }); objects.push(...p.objects); cursor = p.truncated ? p.cursor : undefined; } while (cursor);
  if (objects.length > 3000) throw new Error('Catalogue limit reached');
  const records = new Map();
  for (let i = 0; i < objects.length; i += 25) {
    const batch = await Promise.all(objects.slice(i, i + 25).map(async x => { const o = await env.BUCKET.get(x.key); return o ? { body: await o.json(), etag: o.etag } : null; }));
    for (const r of batch) if (r?.body?.id) records.set(r.body.id, r);
  }
  return records;
}

async function loadSyncDocs(env) {
  const [records, profile, hub, forty, settings] = await Promise.all([loadPlaceRecords(env), readJSON(env, SYNC_KEYS.profile), readJSON(env, SYNC_KEYS.hub), readJSON(env, SYNC_KEYS.forty), readJSON(env, SYNC_KEYS.settings)]);
  const places = new Map();
  for (const p of PLACES_SEED) places.set(p.id, p);
  for (const [id, r] of records) places.set(id, r.body.deleted ? r.body : { ...(places.get(id) || {}), ...r.body });
  const initialForty = { version: 1, selection: FORTY.entries.filter(e => e.group === 'core').map(e => e.id) };
  return {
    docs: {
      places,
      profile: ensureProfileIds(profile ? profile.body : clone(PROFILE_SEED)),
      hub: normaliseHub(hub ? hub.body : null),
      forty: forty ? forty.body : initialForty,
      settings: settings ? settings.body : clone(SETTINGS_EMPTY),
      dirty: new Set(), dirtyPlaces: new Set(),
    },
    meta: { records, profile, hub, forty, settings },
  };
}

function revisions(meta) { return { profile: normEtag(etagOf(meta.profile)), hub: normEtag(etagOf(meta.hub)), forty: normEtag(etagOf(meta.forty)), settings: normEtag(etagOf(meta.settings)) }; }

async function spaceId(env) {
  const existing = await readJSON(env, 'meta/space.json');
  if (existing?.body?.space) return existing.body.space;
  const space = 'space-' + crypto.randomUUID();
  const saved = await env.BUCKET.put('meta/space.json', JSON.stringify({ space, created: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' }, onlyIf: { etagDoesNotMatch: '*' } });
  if (saved) return space;
  return (await readJSON(env, 'meta/space.json')).body.space;
}

const noStore = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
const reply = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: noStore });

async function handleSync(req, env, u) {
  if (u.pathname === '/api/whoami' && req.method === 'GET') { const person = ['me', 'partner'].includes(req.headers.get('x-elsewhere-person')) ? req.headers.get('x-elsewhere-person') : null; return reply({ space: await spaceId(env), build: BUILD_ID, serverTime: new Date().toISOString(), person }); }
  if (u.pathname === '/api/sync/pull' && req.method === 'GET') {
    try {
      const { docs, meta } = await loadSyncDocs(env);
      return reply({ space: await spaceId(env), build: BUILD_ID, serverTime: new Date().toISOString(), places: [...docs.places.values()], profile: docs.profile, hub: docs.hub, forty: docs.forty, settings: docs.settings, revisions: revisions(meta) });
    } catch (e) { return reply({ error: 'Could not read your saved travel data' }, 500); }
  }
  if (u.pathname !== '/api/sync/push') return null;
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (req.headers.get('Origin') !== u.origin) return reply({ error: 'Origin not allowed' }, 403);
  let ops;
  try { const raw = await req.text(); if (raw.length > 3000000) return reply({ error: 'Too many changes at once' }, 413); ops = JSON.parse(raw).ops; } catch { return reply({ error: 'Invalid request' }, 400); }
  if (!Array.isArray(ops) || ops.length > 200) return reply({ error: 'Send at most 200 changes at once' }, 400);
  try { return await pushOps(env, ops); } catch (e) { return reply({ error: 'Your saved data could not be updated right now. Your changes are safe on this device and will retry.' }, 503); }
}
async function pushOps(env, ops) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { docs, meta } = await loadSyncDocs(env);
    const results = [];
    const ledger = await Promise.all(ops.map(op => (typeof op?.opId === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(op.opId)) ? readJSON(env, 'sync/ops/' + op.opId + '.json') : null));
    ops.forEach((op, i) => {
      if (ledger[i]?.body?.status) results.push({ ...ledger[i].body, status: 'duplicate', original: ledger[i].body.status });
      else results.push(applyOp(docs, op, { fortyCatalogue: FORTY }));
    });
    let lost = false;
    for (const c of ['profile', 'hub', 'forty', 'settings']) {
      if (!docs.dirty.has(c) || lost) continue;
      const old = meta[c];
      const saved = await env.BUCKET.put(SYNC_KEYS[c], JSON.stringify(docs[c]), { httpMetadata: { contentType: 'application/json' }, onlyIf: old ? { etagMatches: old.etag } : { etagDoesNotMatch: '*' } });
      if (!saved) lost = true; else meta[c] = { etag: saved.etag, httpEtag: saved.httpEtag };
    }
    for (const id of docs.dirtyPlaces) {
      if (lost) break;
      const old = meta.records.get(id), body = docs.places.get(id);
      const saved = await env.BUCKET.put('atlas/' + id + '.json', JSON.stringify(body), { httpMetadata: { contentType: 'application/json' }, onlyIf: old ? { etagMatches: old.etag } : { etagDoesNotMatch: '*' } });
      if (!saved) lost = true;
    }
    if (lost) continue; // another writer won the race; replay, which is idempotent by value
    await Promise.all(results.filter(r => r.status === 'applied' || (r.status === 'duplicate' && !r.original)).map(r => env.BUCKET.put('sync/ops/' + r.opId + '.json', JSON.stringify({ opId: r.opId, status: r.status, kind: r.kind, id: r.id, at: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } })));
    return reply({ results, revisions: revisions(meta), serverTime: new Date().toISOString() });
  }
  return reply({ error: 'Your saved data is busy. Your changes are safe on this device and will retry.' }, 503);
}

// Offline map packages hosted in the Site's private R2 bucket.
async function handleMaps(req, env, u) {
  if (u.pathname === '/api/maps' && req.method === 'GET') { const c = await readJSON(env, 'maps/catalog.json'); return reply({ regions: c?.body?.regions || [] }); }
  const m = u.pathname.match(/^\/(api\/)?maps\/([a-z0-9-]{1,60})\.pmtiles$/);
  if (!m) return null;
  const key = 'maps/' + m[2] + '.pmtiles';
  if (req.method === 'GET' || req.method === 'HEAD') {
    const range = req.headers.get('Range'), rm = range && range.match(/^bytes=(\d+)-(\d*)$/);
    const opts = rm ? { range: rm[2] ? { offset: +rm[1], length: +rm[2] - +rm[1] + 1 } : { offset: +rm[1] } } : {};
    const o = req.method === 'HEAD' ? await env.BUCKET.head(key) : await env.BUCKET.get(key, opts);
    if (!o) return reply({ error: 'Map region not found' }, 404);
    const h = { 'Content-Type': 'application/vnd.pmtiles', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'ETag': o.httpEtag };
    if (req.method === 'HEAD') return new Response(null, { headers: { ...h, 'Content-Length': String(o.size) } });
    if (rm) { const start = +rm[1], end = rm[2] ? Math.min(+rm[2], o.size - 1) : o.size - 1; return new Response(o.body, { status: 206, headers: { ...h, 'Content-Range': `bytes ${start}-${end}/${o.size}`, 'Content-Length': String(end - start + 1) } }); }
    return new Response(o.body, { headers: { ...h, 'Content-Length': String(o.size) } });
  }
  if (req.method === 'PUT') {
    if (req.headers.get('Origin') !== u.origin) return reply({ error: 'Origin not allowed' }, 403);
    let info; try { info = JSON.parse(decodeURIComponent(req.headers.get('X-Region') || '')); } catch { return reply({ error: 'Describe the region' }, 400); }
    if (!info || !str(info.name, 120) || !Array.isArray(info.bounds) || info.bounds.length !== 4 || info.bounds.some(n => !Number.isFinite(n)) || !Number.isInteger(info.maxzoom) || !/^[a-f0-9]{64}$/.test(info.sha256 || '')) return reply({ error: 'Invalid region description' }, 400);
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > 95000000) return reply({ error: 'Regions must be under 95 MB' }, 413);
    const a = new Uint8Array(bytes); if (String.fromCharCode(...a.slice(0, 7)) !== 'PMTiles') return reply({ error: 'Not a PMTiles archive' }, 400);
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (sha !== info.sha256) return reply({ error: 'The upload was damaged in transit. Try again.' }, 422);
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/vnd.pmtiles' } });
    for (let i = 0; i < 4; i++) {
      const c = await readJSON(env, 'maps/catalog.json'), regions = (c?.body?.regions || []).filter(r => r.id !== m[2]);
      regions.push({ id: m[2], name: info.name, bounds: info.bounds, minzoom: info.minzoom ?? 0, maxzoom: info.maxzoom, bytes: bytes.byteLength, sha256: sha, built: str(info.built, 40) ? info.built : '', attribution: '© OpenStreetMap contributors · Protomaps', uploaded: new Date().toISOString() });
      const saved = await env.BUCKET.put('maps/catalog.json', JSON.stringify({ regions }), { httpMetadata: { contentType: 'application/json' }, onlyIf: c ? { etagMatches: c.etag } : { etagDoesNotMatch: '*' } });
      if (saved) return reply({ saved: true, id: m[2], sha256: sha });
    }
    return reply({ error: 'Map catalogue busy; try again' }, 503);
  }
  if (req.method === 'DELETE') {
    if (req.headers.get('Origin') !== u.origin) return reply({ error: 'Origin not allowed' }, 403);
    await env.BUCKET.delete(key);
    const c = await readJSON(env, 'maps/catalog.json');
    if (c) await env.BUCKET.put('maps/catalog.json', JSON.stringify({ regions: c.body.regions.filter(r => r.id !== m[2]) }), { httpMetadata: { contentType: 'application/json' } });
    return reply({ saved: true });
  }
  return reply({ error: 'Method not allowed' }, 405);
}

// Private calendar feed. Calendar apps cannot sign in, so the feed URL carries a long random token
// (rotatable). Everything else stays behind the site's sign-in or passphrase gate.
async function feedToken(env, rotate) {
  const cur = await readJSON(env, 'meta/feed-token.json');
  if (cur?.body?.token && !rotate) return cur.body.token;
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.BUCKET.put('meta/feed-token.json', JSON.stringify({ token, created: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
  return token;
}
function keyDates(docs) {
  const ev = [], add = (uid, date, summary, desc = '', end = null) => { if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) ev.push({ uid, date, summary, desc, end }); };
  const tripName = id => docs.profile.trips.find(t => t.id === id)?.name || '';
  for (const t of docs.profile.trips) {
    if (t.windowStart) { const e = t.windowEnd || t.windowStart, last = new Date(Date.UTC(+e.slice(0, 4), +e.slice(5, 7), 1)).toISOString().slice(0, 10); add('window-' + t.id, t.windowStart + '-01', t.name + ' (target window, not booked)', 'A planning window from Wanderlust.', last); }
    for (const c of t.costs) if (c.dueDate) add('cost-' + c.id, c.dueDate, t.name + ': payment due, ' + c.item);
    for (const x of t.tasks) if (x.due && !x.done) add('task-' + x.id, x.due, t.name + ': ' + x.text);
  }
  for (const r of docs.hub.records.reminders) if (r.state !== 'Done') add('rem-' + r.id, r.date, (tripName(r.trip) ? tripName(r.trip) + ': ' : '') + (r.kind ? r.kind + ' · ' : '') + r.title, r.notes || '');
  for (const b of docs.hub.records.bookings) { add('pay-' + b.id, b.payment, tripName(b.trip) + ': payment due, ' + b.title); add('cxl-' + b.id, b.cancellation, tripName(b.trip) + ': free cancellation ends, ' + b.title); }
  for (const r of docs.hub.records.research) add('rev-' + r.id, r.review, tripName(r.trip) + ': check again, ' + r.title);
  for (const p of docs.hub.records.people) add('passport-' + p.id, p.passportExpiry, p.name + '’s passport expires');
  return ev;
}
function icsFrom(docs) {
  const ev = keyDates(docs);
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z'), d = s => s.replaceAll('-', '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wanderlust//Key dates//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Wanderlust', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'];
  for (const e of ev) { const next = e.end || new Date(Date.parse(e.date) + 864e5).toISOString().slice(0, 10); lines.push('BEGIN:VEVENT', 'UID:' + e.uid + '@elsewhere', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d(e.date), 'DTEND;VALUE=DATE:' + d(next), 'SUMMARY:' + esc(e.summary), 'DESCRIPTION:' + esc(e.desc), ...(e.end ? [] : ['BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.summary), 'END:VALARM']), 'END:VEVENT'); }
  lines.push('END:VCALENDAR');
  return lines.flatMap(s => { const out = []; let line = ''; for (const c of s) { if (new TextEncoder().encode(line + c).length > 70) { out.push(line); line = ' ' + c; } else line += c; } out.push(line); return out; }).join('\r\n') + '\r\n';
}
async function handleFeed(req, env, u) {
  if (u.pathname === '/api/feed') {
    if (req.method === 'POST' && req.headers.get('Origin') !== u.origin) return reply({ error: 'Origin not allowed' }, 403);
    if (req.method !== 'GET' && req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    return reply({ token: await feedToken(env, req.method === 'POST') });
  }
  const m = u.pathname.match(/^\/feed\/([a-f0-9]{48})\.ics$/);
  if (!m) return u.pathname.startsWith('/feed/') ? new Response('Not found', { status: 404 }) : null;
  const cur = await readJSON(env, 'meta/feed-token.json'), want = cur?.body?.token || '';
  let diff = want.length === m[1].length ? 0 : 1; for (let i = 0; i < m[1].length; i++) diff |= m[1].charCodeAt(i) ^ (want.charCodeAt(i) || 0);
  if (diff) return new Response('Not found', { status: 404 });
  const { docs } = await loadSyncDocs(env);
  return new Response(icsFrom(docs), { headers: { 'Content-Type': 'text/calendar;charset=utf-8', 'Cache-Control': 'private, max-age=900', 'X-Robots-Tag': 'noindex' } });
}

// Exchange rates for the optional AUD estimate: free ECB reference rates via Frankfurter (no key, no
// account). Cached for 12 hours; if the source is unreachable the last copy is returned, marked stale.
// No user data is sent: the request contains only the base currency.
async function handleRates(req, env, u) {
  if (u.pathname !== '/api/rates' || req.method !== 'GET') return null;
  const cached = await readJSON(env, 'meta/rates.json');
  if (cached?.body && Date.now() - Date.parse(cached.body.fetched) < 12 * 3600e3) return reply(cached.body);
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=AUD', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const body = { base: 'AUD', date: d.date, rates: d.rates, fetched: new Date().toISOString(), source: 'European Central Bank reference rates via Frankfurter (frankfurter.dev)' };
    await env.BUCKET.put('meta/rates.json', JSON.stringify(body), { httpMetadata: { contentType: 'application/json' } });
    return reply(body);
  } catch (e) { return cached?.body ? reply({ ...cached.body, stale: true }) : reply({ error: 'Exchange rates are unavailable right now.' }, 503); }
}

// Push notifications (Web Push with this site's own VAPID keys; payloads are encrypted end to end).
async function handlePush(req, env, u) {
  if (!u.pathname.startsWith('/api/push/')) return null;
  const pub = typeof process !== 'undefined' ? process.env.VAPID_PUBLIC_KEY : null;
  if (u.pathname === '/api/push/key') return pub ? reply({ key: pub }) : reply({ error: 'Notifications are not set up on this site.' }, 503);
  if (req.method !== 'POST' || req.headers.get('Origin') !== u.origin) return reply({ error: 'Not allowed' }, 403);
  const sub = await req.json().catch(() => null), cur = (await readJSON(env, 'push/subscriptions.json'))?.body || { subs: [] };
  if (u.pathname === '/api/push/subscribe' && sub?.endpoint?.startsWith('https://')) { cur.subs = [...cur.subs.filter(s => s.endpoint !== sub.endpoint), { ...sub, person: req.headers.get('x-elsewhere-person') || '', added: new Date().toISOString() }].slice(-20); }
  else if (u.pathname === '/api/push/unsubscribe' && sub?.endpoint) cur.subs = cur.subs.filter(s => s.endpoint !== sub.endpoint);
  else return reply({ error: 'Invalid subscription' }, 400);
  await env.BUCKET.put('push/subscriptions.json', JSON.stringify(cur), { httpMetadata: { contentType: 'application/json' } });
  return reply({ saved: true, devices: cur.subs.length });
}

// "Search flight deals" (Deals board button): for each fare target marked to watch, asks Google Flights
// (through SerpApi) for the cheapest price on the target's dates, logs it on the Deals board like a fare
// you entered, and returns what changed: at or under target, a drop, a sharp rise, or Google rating it low.
// Runs only when someone presses the button (POST /fares/search, behind the passphrase gate).
//
// Only airport codes, dates and the number of travellers are sent to SerpApi; never names or trips.
// Needs SERPAPI_KEY in Netlify. SerpApi's free plan is 250 searches a month; searches stop at
// FAREWATCH_MONTHLY_CAP (default 150) so it can never run into a paid tier, and each route is searched
// at most once an hour however often the button is pressed.
import { getStore } from '@netlify/blobs';
import { internals } from '../../dist/netlify-server/index.mjs';
import { netlifyBucket } from '../../server/netlify-bucket.mjs';
import { isWatch, fareAlerts, fareLinks } from '../../src/core/fares.js';

const melDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.WANDERLUST_TIMEZONE || 'Australia/Melbourne' }).format(d);
const USAGE = 'farewatch/usage.json';

export async function checkFare(target, key, fetchImpl = fetch) {
  const [from, to] = target.route.split('-'), adults = Math.max(1, Math.min(9, +target.adults || 1));
  const q = new URLSearchParams({ engine: 'google_flights', departure_id: from, arrival_id: to, outbound_date: target.outDate, type: target.backDate ? '1' : '2', currency: 'AUD', hl: 'en', gl: 'au', adults: String(adults), api_key: key });
  if (target.backDate) q.set('return_date', target.backDate);
  const r = await fetchImpl('https://serpapi.com/search.json?' + q, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('SerpApi ' + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error);
  const options = [...(j.best_flights || []), ...(j.other_flights || [])].filter(o => Number.isFinite(o.price));
  const best = options.sort((a, b) => a.price - b.price)[0], pi = j.price_insights || {};
  const price = best?.price ?? pi.lowest_price; if (!Number.isFinite(price)) return null;
  const range = Array.isArray(pi.typical_price_range) ? 'AUD ' + pi.typical_price_range.map(n => Math.round(n).toLocaleString('en-AU')).join('–') : '';
  const airline = best ? [...new Set((best.flights || []).map(f => f.airline).filter(Boolean))].join(', ') : '';
  return { price: String(Math.round(price)), currency: 'AUD', level: pi.price_level || '', typical: range, airline, url: j.search_metadata?.google_flights_url || fareLinks(from, to, target.outDate, target.backDate, adults)[0]?.url || '' };
}

const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export default async req => {
  if (req.method === 'GET') { // status for the button: is it set up, and how many searches are left
    const env = { BUCKET: netlifyBucket(getStore({ name: 'elsewhere', consistency: 'strong' })) }, month = melDate().slice(0, 7);
    const usage = (await internals.readJSON(env, USAGE))?.body || {}, cap = capOf();
    return json({ ready: !!process.env.SERPAPI_KEY, used: usage.month === month ? usage.count : 0, cap });
  }
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const origin = req.headers.get('Origin'); if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: 'Wrong origin' }, 403);
  const key = process.env.SERPAPI_KEY; if (!key) return json({ error: 'Fare searching is not set up yet: add SERPAPI_KEY in Netlify.' }, 503);
  const cap = capOf(), env = { BUCKET: netlifyBucket(getStore({ name: 'elsewhere', consistency: 'strong' })) };
  const now = new Date(), today = melDate(now), month = today.slice(0, 7), hourAgo = new Date(now - 36e5).toISOString();
  const usage = (await internals.readJSON(env, USAGE))?.body || {}; if (usage.month !== month) Object.assign(usage, { month, count: 0 });
  usage.checked ??= {};
  const { docs } = await internals.loadSyncDocs(env), recs = docs.hub?.records || {};
  const watches = (recs.fareTargets || []).filter(t => isWatch(t) && t.outDate >= today);
  const fresh = watches.filter(t => !(usage.checked[t.id] > hourAgo)), room = Math.max(0, cap - usage.count);
  const due = fresh.sort((a, b) => (usage.checked[a.id] || '').localeCompare(usage.checked[b.id] || '')).slice(0, room);
  const ops = [], results = [], at = now.toISOString(), stamp = at.slice(0, 16).replace(/\D/g, '');
  for (const t of due) {
    let found; try { found = await checkFare(t, key); } catch (e) { console.error('fare check failed', t.route, e.message); results.push({ route: t.route, error: 'Search failed' }); continue; } finally { usage.count++; usage.checked[t.id] = at; }
    if (!found) { results.push({ route: t.route, error: 'No flights found for those dates' }); continue; }
    const prev = (recs.fares || []).filter(f => f.watch === t.id).sort((a, b) => (a.checkedAt || a.seenOn || '').localeCompare(b.checkedAt || b.seenOn || '')).at(-1);
    const id = 'auto-' + t.id.slice(-40) + '-' + stamp;
    ops.push({ opId: 'fw-' + t.id.slice(-30) + '-' + stamp, at, kind: 'fares', id, action: 'create', entity: { id, trip: t.trip || '', route: t.route, price: found.price, currency: found.currency, seenOn: today, checkedAt: at, travelDates: t.outDate + (t.backDate ? ' – ' + t.backDate : ' (one way)') + ' · ' + (t.adults || '1') + ' adult(s)', airline: found.airline, url: found.url, source: 'Google Flights (searched)', watch: t.id, level: found.level, typical: found.typical } });
    results.push({ route: t.route, price: found.price, currency: found.currency, airline: found.airline, level: found.level, typical: found.typical, alerts: fareAlerts(t, prev, found) });
  }
  if (ops.length) await internals.pushOps(env, ops);
  await env.BUCKET.put(USAGE, JSON.stringify(usage), { httpMetadata: { contentType: 'application/json' } });
  return json({ searched: due.length, watched: watches.length, skippedRecent: watches.length - fresh.length, skippedCap: fresh.length - due.length, used: usage.count, cap, results });
};
const capOf = () => Math.max(0, Math.min(240, +process.env.FAREWATCH_MONTHLY_CAP || 150));
export const config = { path: '/fares/search' };

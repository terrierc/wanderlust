// Fare watching: prefilled search links (Google Flights, Skyscanner, I Want That Flight), your own price log,
// targets, and an optional on-demand check of Google Flights prices (netlify/functions/fare-watch.mjs).
export const iata = s => (String(s || '').match(/\(([A-Z]{3})\)/) || String(s || '').match(/^([A-Z]{3})$/) || [])[1] || '';
export const routeKey = (a, b) => (a && b ? a + '-' + b : '');
const yymmdd = d => d ? d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10) : '';
// Prefilled searches using the leg's dates (or the trip window when dates aren't set) and party size.
export function fareLinks(from, to, out, back, adults) {
  if (!from || !to) return [];
  const q = 'Flights from ' + from + ' to ' + to + (out ? ' on ' + out : '') + (back ? ' returning ' + back : '') + ' for ' + adults + ' adult' + (adults > 1 ? 's' : '');
  return [
    { label: 'Google Flights', url: 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q) },
    { label: 'Skyscanner', url: 'https://www.skyscanner.com.au/transport/flights/' + from.toLowerCase() + '/' + to.toLowerCase() + '/' + (out ? yymmdd(out) + '/' : '') + (out && back ? yymmdd(back) + '/' : '') + '?adults=' + adults },
    { label: 'I Want That Flight', url: 'https://iwantthatflight.com.au/cheap-flights/' + from + '/' + to + '/flights-to/' + to + '/cheap-flights' },
  ];
}
// Each leg's flights: in from home or the previous city, out to home or the next city.
export function legFlights(store, trip) {
  const out = [], HOME = (store.get('people', 'me')?.homeAirport || '').toUpperCase();
  for (const l of store.records('segments', trip.id)) {
    const a = iata(l.flyIn), b = iata(l.flyOut), adults = l.partner === 'no' ? 1 : 2;
    const start = l.start || (trip.windowStart ? trip.windowStart + '-01' : ''), end = l.end || '';
    if (l.option === 'You') { out.push({ leg: l, from: HOME, to: '', note: 'Outbound gateway depends on the route you choose', links: [] }); continue; }
    if (a && HOME) out.push({ leg: l, from: HOME, to: a, adults, links: fareLinks(HOME, a, start, end && b === a ? end : '', adults) });
    if (b && b !== a && HOME) out.push({ leg: l, from: b, to: HOME, adults, links: fareLinks(b, HOME, end, '', adults) });
  }
  return out;
}
export function routeStats(store, key) {
  const log = store.list('fares').filter(f => f.route === key && f.price !== '').sort((x, y) => (x.seenOn || '').localeCompare(y.seenOn || ''));
  const target = store.list('fareTargets').find(t => t.route === key);
  const latest = log.at(-1), lowest = log.reduce((m, f) => (!m || +f.price < +m.price ? f : m), null);
  const ratio = latest && target?.price ? +latest.price / +target.price : null;
  return { log, target, latest, lowest, ratio, good: ratio !== null && ratio <= 1 && latest.currency === target.currency };
}

// ---------- automatic watching (shared by the scheduled job and the app) ----------
// A watch is a fare target with auto: 'yes', an outbound date and optionally a return date.
export const isWatch = t => t?.auto === 'yes' && /^\d{4}-\d{2}-\d{2}$/.test(t.outDate || '');
// Decide what is worth a notification, comparing a new automatic price with the previous one.
// Returns a list of { kind, title, body }; empty when nothing changed enough to bother you.
export function fareAlerts(target, prev, now) {
  const out = [], p = +now.price, route = target.route.replace('-', ' → '), cur = now.currency || 'AUD';
  const fmt = n => cur + ' ' + Math.round(n).toLocaleString('en-AU');
  const goal = target.price !== '' && target.currency === cur ? +target.price : null;
  if (goal !== null && p <= goal && !(prev && +prev.price <= goal)) out.push({ kind: 'target', title: 'Book it: ' + route + ' ' + fmt(p), body: 'At or below your target of ' + fmt(goal) + ' for ' + target.outDate + (target.backDate ? ' – ' + target.backDate : '') + '.' });
  if (prev && +prev.price > 0) {
    const d = p - +prev.price, pct = d / +prev.price;
    if (d <= -Math.max(40, +prev.price * 0.05)) out.push({ kind: 'drop', title: 'Price drop: ' + route + ' ' + fmt(p), body: 'Down ' + fmt(-d) + ' (' + Math.round(-pct * 100) + '%) since ' + prev.seenOn + '.' });
    else if (pct >= 0.1) out.push({ kind: 'rise', title: 'Price up: ' + route + ' ' + fmt(p), body: 'Up ' + fmt(d) + ' (' + Math.round(pct * 100) + '%) since ' + prev.seenOn + '. Book soon if these dates are fixed.' });
  }
  if (now.level === 'low' && prev?.level !== 'low') out.push({ kind: 'low', title: 'Google rates ' + route + ' as low', body: fmt(p) + (now.typical ? '; typical is ' + now.typical : '') + '.' });
  return out;
}

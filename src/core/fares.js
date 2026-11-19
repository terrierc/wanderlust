// Fare watching without a paid data service: prefilled search links, your own price log and targets.
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

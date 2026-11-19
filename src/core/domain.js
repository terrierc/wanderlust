// Travel rules that the screens share. Nothing here invents prices, durations or dates.
export const WISH = ['Want to go', 'Planning', 'Booked'];
export const isBlank = v => v === null || v === undefined || v === '';

export function money(amount, currency = 'AUD') {
  if (isBlank(amount)) return 'Unknown';
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount); }
  catch { return currency + ' ' + Number(amount).toLocaleString('en-AU'); }
}

// Totals per currency. Unknown amounts stay unknown and are counted, never treated as zero.
// Bookings are never summed here: a booking's price lives in its linked cost, so it is counted once.
export function costTotals(costs) {
  const by = {};
  for (const c of costs) {
    const cur = c.currency || 'AUD', t = (by[cur] ??= { currency: cur, known: 0, paid: 0, myShare: 0, unknown: 0, unknownPaid: 0, unknownShare: 0, items: 0 });
    t.items++;
    if (isBlank(c.total)) t.unknown++; else t.known += c.total;
    if (isBlank(c.paid)) t.unknownPaid++; else t.paid += c.paid;
    if (isBlank(c.myShare)) t.unknownShare++; else t.myShare += c.myShare;
  }
  return Object.values(by);
}
export const nightsOf = trip => (trip.stops || []).reduce((n, s) => n + (s.nights || 0), 0);
export const budgetLabel = t => isBlank(t.budget) ? 'Budget not set' : money(t.budget, t.budgetCurrency || 'AUD') + ' ' + (t.budgetBasis === 'per person' ? 'per person' : 'for the party');

export function todayISO(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value; return g('year') + '-' + g('month') + '-' + g('day');
}
export function prettyDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-AU', { ...opts, timeZone: 'UTC' });
}
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Convert a wall-clock time in an IANA zone to an absolute instant (for leg durations across zones).
export function zonedInstant(date, time, timeZone) {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = (time || '12:00').split(':').map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  if (!timeZone) return guess;
  try {
    for (let i = 0; i < 2; i++) {
      const p = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess));
      const v = t => +p.find(x => x.type === t).value;
      const asUTC = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'));
      guess += Date.UTC(y, m - 1, d, hh, mm) - asUTC;
    }
    return guess;
  } catch { return null; }
}
export function legDuration(l) {
  const a = zonedInstant(l.date, l.departTime, l.departTz), b = zonedInstant(l.arriveDate, l.arriveTime, l.arriveTz);
  if (a === null || b === null || !l.arriveDate || !l.departTime || !l.arriveTime) return null;
  return (b - a) / 3600000;
}
export const validZone = z => { if (!z) return true; try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
export const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return []; } })();

// Research older than its review date, or a year after checking, is flagged for re-checking.
export function staleness(r, today = todayISO()) {
  if (r.review && r.review <= today) return 'Review date passed';
  if (r.checked && addDays(r.checked, 365) <= today) return 'Checked over a year ago';
  if (!r.checked) return 'Not checked';
  return '';
}

export function deadlines(store, tripId) {
  const items = [];
  for (const t of store.list('trip')) {
    if (tripId && t.id !== tripId) continue;
    for (const c of store.list('cost', t.id)) if (c.dueDate) items.push({ id: c.id + '-due', trip: t.id, date: c.dueDate, kind: 'Payment', title: (c.item || 'Payment') + ' due', notes: isBlank(c.total) ? 'Amount not entered' : money(c.total, c.currency) + ' · paid ' + money(c.paid, c.currency), url: c.url });
    for (const x of store.list('task', t.id)) if (x.due && !x.done) items.push({ id: x.id + '-due', trip: t.id, date: x.due, kind: 'Task', title: x.text });
  }
  for (const [kind, fields] of [['reminders', ['date']], ['bookings', ['payment', 'cancellation']], ['research', ['review']]])
    for (const r of store.records(kind, tripId)) for (const f of fields) if (r[f] && r.state !== 'Done') items.push({ id: r.id + '-' + f, trip: r.trip, date: r[f], kind: f === 'date' ? (r.kind || 'Reminder') : f === 'review' ? 'Research review' : f === 'payment' ? 'Payment deadline' : 'Free cancellation ends', title: r.title || r.topic, notes: r.notes || '', url: r.url });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function countryMatch(place, c) {
  if (c.code === 'GB-ENG') return /England/.test(place.country);
  if (c.code === 'US') return /United States|USA|Hawai/.test(place.country);
  if (c.code === 'TR') return /Türkiye|Turkey/.test(place.country);
  return place.country === c.name || place.country.split(/ and | \/ |, /).includes(c.name);
}

// ---------- forty ----------
export function fortyModel(store, FORTY) {
  const selection = store.get('fortySelection', 'selection')?.selection || [];
  const extras = store.list('fortyExtra').map(e => ({ ...e, group: 'optional', extra: true, photoId: e.placeId }));
  const entries = [...FORTY.entries, ...extras];
  const groupOf = e => selection.includes(e.id) ? 'core' : (e.group === 'core' || e.extra) ? 'optional' : e.group;
  const place = e => store.get('place', e.placeId);
  const personal = e => store.get('fortyEntry', e.id) || {};
  const slot = e => selection.indexOf(e.id) + 1;
  const done = selection.filter(id => place(entries.find(e => e.id === id) || {})?.status === 'Visited').length;
  return { selection, entries, groupOf, place, personal, slot, done };
}

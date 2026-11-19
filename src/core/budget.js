// Budgets that plan: categories, estimate/quoted/booked/paid lines with low–likely–high ranges,
// per-currency totals, and an optional AUD estimate that is always labelled with its rate date.
import { isBlank } from './domain.js';
export const CATEGORIES = ['Flights', 'Internal transport', 'Accommodation', 'Tours and guides', 'Permits and park fees', 'Expedition / cruise', 'Visas', 'Insurance', 'Vaccinations and health', 'Gear', 'Food', 'Activities', 'Buffer', 'Other'];
export const STATES = ['estimate', 'quoted', 'booked', 'paid'];

// Unknown stays unknown: a line with no amount is counted, never added as zero.
export function lineRange(c) {
  if (isBlank(c.total)) return null;
  if ((c.state || 'estimate') !== 'estimate') return { low: c.total, likely: c.total, high: c.total };
  return { low: isBlank(c.low) ? c.total : c.low, likely: c.total, high: isBlank(c.high) ? c.total : c.high };
}
export function rangeTotals(costs) {
  const by = {};
  for (const c of costs) {
    const cur = c.currency || 'AUD', t = (by[cur] ??= { currency: cur, low: 0, likely: 0, high: 0, unknown: 0, items: 0, paid: 0 }), r = lineRange(c);
    t.items++; if (!r) t.unknown++; else { t.low += r.low; t.likely += r.likely; t.high += r.high; }
    if (!isBlank(c.paid)) t.paid += c.paid;
  }
  return Object.values(by);
}
// rates: { base: 'AUD', rates: { EUR: 0.61, ... } } meaning 1 AUD = rate units. Currencies without a
// rate are listed in `missing` and left out of the converted figure; they are never guessed.
export function toAUD(totals, rates) {
  const out = { low: 0, likely: 0, high: 0, paid: 0, missing: [], unknown: 0 };
  for (const t of totals) {
    const r = t.currency === 'AUD' ? 1 : rates?.rates?.[t.currency];
    out.unknown += t.unknown;
    if (!r) { out.missing.push(t.currency); continue; }
    for (const k of ['low', 'likely', 'high', 'paid']) out[k] += t[k] / r;
  }
  return out;
}
export function monthsUntil(ym, from = new Date().toISOString().slice(0, 7)) {
  return Math.max(0, (+ym.slice(0, 4) - +from.slice(0, 4)) * 12 + (+ym.slice(5, 7) - +from.slice(5, 7)));
}
// Savings: contributions (AUD) against a trip's likely AUD estimate, with the monthly amount needed to be ready by the window.
export function savingsPlan(store, trip, rates) {
  const totals = rangeTotals(store.list('cost', trip.id)), aud = toAUD(totals, rates);
  const saved = store.records('savings', trip.id).reduce((n, s) => n + (Number(s.amount) || 0), 0);
  const months = trip.windowStart ? monthsUntil(trip.windowStart) : null;
  const target = aud.likely, left = Math.max(0, target - saved);
  return { totals, aud, saved, target, left, months, perMonth: months ? left / months : null, complete: !aud.missing.length && !aud.unknown };
}

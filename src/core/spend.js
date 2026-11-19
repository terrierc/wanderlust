// Spending on the road: what was actually spent, per day and in total, per person and for the party.
// Amounts stay in their own currency. A blank amount is unknown and never counted as zero.
import { rangeTotals } from './budget.js';
import { lengthDays } from './plan.js';
import { expenseShares } from './shared.js';

export const SPEND_CATEGORIES = ['Food and drink', 'Transport', 'Accommodation', 'Tickets and entry', 'Tours and guides', 'Shopping', 'Tips', 'Health', 'Other'];

const add = (o, k, v) => { o[k] = (o[k] || 0) + v; return o; };
export function spendSummary(store, trip) {
  const list = store.records('expenses', trip.id).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || '').localeCompare(b.id || ''));
  const days = new Map(), total = {}, perPerson = {}, unknown = [];
  for (const e of list) {
    const amt = Number(e.amount), cur = e.currency || 'AUD';
    if (e.amount === '' || e.amount == null || !Number.isFinite(amt)) { unknown.push(e); continue; }
    const d = days.get(e.date || '') || days.set(e.date || '', { date: e.date || '', totals: {}, items: [] }).get(e.date || '');
    add(d.totals, cur, amt); d.items.push(e); add(total, cur, amt);
    const sh = expenseShares(e); if (sh) for (const [p, v] of Object.entries(sh)) add(perPerson[cur] ??= {}, p, v);
  }
  // Running totals day by day, per currency.
  const run = {}, rows = [...days.values()].map(d => { for (const [c, v] of Object.entries(d.totals)) add(run, c, v); return { ...d, running: { ...run } }; });
  return { rows, total, perPerson, unknown, count: list.length };
}
// A daily allowance to compare against: the trip budget if set, else the likely estimate (clearly labelled).
export function dailyAllowance(store, trip) {
  const n = lengthDays(trip.lengthNote); if (!n) return null;
  if (Number.isFinite(trip.budget) && trip.budget > 0) return { amount: trip.budget / n, currency: trip.budgetCurrency || 'AUD', basis: 'your budget over ' + n + ' days' };
  const t = rangeTotals(store.list('cost', trip.id)).find(x => x.currency === 'AUD');
  return t && t.likely > 0 ? { amount: t.likely / n, currency: 'AUD', basis: 'the likely estimate over ' + n + ' days (includes flights and pre-booked items)' } : null;
}

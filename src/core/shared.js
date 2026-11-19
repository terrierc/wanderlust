// Shared expenses: who paid, how a cost splits, who owes whom. Travellers are planning labels, not accounts.
import { isBlank } from './domain.js';
export const SPLITS = [['leg', 'Follow the leg (default)'], ['equal', 'Equally between You and Partner'], ['shares', 'By shares'], ['exact', 'By exact amounts'], ['me', 'You only'], ['partner', 'Partner only']];
const PEOPLE = ['me', 'partner'];

// Default split follows the leg's party: a You-only leg is You's alone; a shared leg splits
// equally (Partner counts on a leg only when they are "yes"). A trip-level cost with no leg must say who it covers.
export function effectiveSplit(store, c) {
  if (c.split && c.split !== 'leg') return c.split;
  const leg = c.segmentId && store.get('segments', c.segmentId);
  if (!leg) return null; // not decided: asks who it covers
  return leg.option === 'You' ? 'me' : leg.partner === 'yes' ? 'equal' : 'me';
}
// Amount each person is responsible for, or null when it cannot be worked out without guessing.
export function owed(store, c) {
  if (isBlank(c.total)) return null;
  const s = effectiveSplit(store, c);
  if (!s) return null;
  if (s === 'me' || s === 'partner') return { me: s === 'me' ? c.total : 0, partner: s === 'partner' ? c.total : 0 };
  if (s === 'equal') return { me: c.total / 2, partner: c.total / 2 };
  const a = Number(c.shareMe) || 0, b = Number(c.sharePartner) || 0;
  if (s === 'shares') return a + b > 0 ? { me: c.total * a / (a + b), partner: c.total * b / (a + b) } : null;
  if (s === 'exact') return Math.abs(a + b - c.total) < 0.005 ? { me: a, partner: b } : null;
  return null;
}
// Net balance per currency per person: positive means others owe them.
export function balances(store, trips) {
  const by = {}, undecided = [];
  for (const t of trips) for (const c of store.list('cost', t.id)) {
    if (isBlank(c.paid) || !c.paidBy) continue; // only money actually paid moves balances
    const o = owed(store, { ...c, total: c.paid });
    if (!o) { undecided.push({ trip: t, cost: c }); continue; }
    const b = (by[c.currency || 'AUD'] ??= { me: 0, partner: 0 });
    b[c.paidBy] += c.paid; for (const p of PEOPLE) b[p] -= o[p];
  }
  for (const s of store.list('settlements')) {
    if (s.trip && !trips.some(t => t.id === s.trip)) continue;
    const b = (by[s.currency] ??= { me: 0, partner: 0 }), amt = Number(s.amount) || 0;
    b[s.from] += amt; b[s.to] -= amt;
  }
  return { by, undecided };
}
// Fewest transfers to clear each currency (greedy; exact for two people, minimal in count for small groups).
export function transfers(by) {
  const out = [];
  for (const [cur, b] of Object.entries(by)) {
    const debt = Object.entries(b).filter(([, v]) => v < -0.005).map(([p, v]) => [p, -v]), cred = Object.entries(b).filter(([, v]) => v > 0.005).map(([p, v]) => [p, v]);
    while (debt.length && cred.length) { const amt = Math.min(debt[0][1], cred[0][1]); out.push({ from: debt[0][0], to: cred[0][0], amount: Math.round(amt * 100) / 100, currency: cur }); debt[0][1] -= amt; cred[0][1] -= amt; if (debt[0][1] < 0.005) debt.shift(); if (cred[0][1] < 0.005) cred.shift(); }
  }
  return out;
}
// What each person's legs cost them (planned amounts), per currency.
export function perPerson(store, trip) {
  const by = {}, undecided = [];
  for (const c of store.list('cost', trip.id)) { const o = owed(store, c); if (!o) { undecided.push(c); continue; } const b = (by[c.currency || 'AUD'] ??= { me: 0, partner: 0 }); for (const p of PEOPLE) b[p] += o[p]; }
  return { by, undecided };
}

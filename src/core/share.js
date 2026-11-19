// Read-only trip links: what a link may show. One trip only, built fresh on each visit from the saved data,
// and only the parts that link includes. Never documents, receipts, other trips, the atlas or settings.
// Booking references are off unless chosen (a reference plus a surname can often manage a booking).
export const SHARE_DEFAULTS = { money: false, refs: false, policy: true };
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined && o[k] !== '').map(k => [k, o[k]]));

export function buildSnapshot(docs, tripId, include = SHARE_DEFAULTS, EMERGENCY = null) {
  const trips = docs.profile?.trips || [], t = trips.find(x => x.id === tripId); if (!t) return null;
  const R = docs.hub?.records || {}, of = k => (R[k] || []).filter(r => r.trip === tripId);
  const people = R.people || [], name = id => people.find(p => p.id === id)?.name || id;
  const party = String(t.party || '').split(',').map(s => s.trim()).filter(Boolean);
  const inc = { ...SHARE_DEFAULTS, ...include };
  const out = {
    trip: { name: t.name, scope: t.scope || '', lengthNote: t.lengthNote || '', windowStart: t.windowStart || '', windowEnd: t.windowEnd || '', startDate: t.startDate || '' },
    travellers: (party.length ? party : people.filter(p => p.guest !== 'yes').map(p => p.id)).map(name),
    route: (t.stops || []).map(s => ({ name: s.name, nights: s.nights })),
    days: of('days').map(d => pick(d, ['date', 'time', 'tz', 'title', 'location', 'transport', 'notes'])),
    connections: of('legs').map(l => pick(l, ['from', 'to', 'mode', 'date', 'departTime', 'departTz', 'arriveDate', 'arriveTime', 'arriveTz', 'operator', 'notes'])),
    stays: of('bookings').filter(b => b.type === 'Accommodation').map(b => pick(b, ['title', 'date', 'end', 'address', 'phone', ...(inc.refs ? ['reference'] : [])])).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    flights: of('bookings').filter(b => b.type === 'Flight').map(b => pick(b, ['title', 'date', 'end', 'address', 'phone', ...(inc.refs ? ['reference'] : [])])),
    emergency: null, money: null, builtAt: new Date().toISOString(),
  };
  if (EMERGENCY) {
    const want = (t.countryQueries || []).map(String), countries = want.map(q => { const hit = Object.entries(EMERGENCY.countries || {}).find(([k, v]) => k === q || (v.aliases || []).some(a => a.toLowerCase() === q.toLowerCase())); return hit ? { name: hit[0], ...hit[1] } : { name: q, missing: true }; });
    out.emergency = { consular: EMERGENCY.consularEmergency, countries, insurance: inc.policy ? pick(t, ['insurer', 'policyNumber', 'insurerPhone']) : pick(t, ['insurer', 'insurerPhone']) };
  }
  if (inc.money) {
    const costs = (t.costs || []).map(c => pick(c, ['item', 'category', 'state', 'low', 'total', 'high', 'currency']));
    out.money = { estimates: costs, spent: of('expenses').map(e => ({ ...pick(e, ['date', 'amount', 'currency', 'category', 'note']), paidBy: name(e.paidBy) })) };
  }
  return out;
}
// Token helpers: 32 random bytes, base64url (43 characters). Only the SHA-256 fingerprint is ever stored.
export function newToken() { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function fingerprint(token) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const expired = (rec, today) => !!rec.expires && rec.expires < today;

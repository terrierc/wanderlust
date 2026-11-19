// The "The forty" plan: trips with target windows, Partner's optional legs, best months and checks.
// Shared by the browser and the build (compile.mjs fails the build if validatePlan finds a problem).
export const PLAN_MARKER = 'forty-plan-2026 v1';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function windowMonths(start, end) {
  if (!/^\d{4}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}$/.test(end || '')) return [];
  const out = []; let [y, m] = start.split('-').map(Number); const [ey, em] = end.split('-').map(Number);
  for (let i = 0; i < 36 && (y < ey || (y === ey && m <= em)); i++) { out.push(m); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
export function windowLabel(start, end) {
  if (!start) return 'Window not set';
  const f = s => MON[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4);
  if (!end || end === start) return f(start);
  return start.slice(0, 4) === end.slice(0, 4) ? MON[+start.slice(5, 7) - 1] + ' to ' + f(end) : f(start) + ' to ' + f(end);
}
export const monthsLabel = ms => ms.length === 12 ? 'Year-round' : ms.map(m => MON[m - 1]).join(', ');

// Every core slot must belong to exactly one trip; windows must end before the deadline.
export function validatePlan(plan, FORTY) {
  const errors = [], seen = new Map();
  const core = FORTY.entries.filter(e => e.group === 'core').map(e => e.id);
  for (const t of plan.trips) for (const s of t.slots) { if (seen.has(s)) errors.push(s + ' is in both ' + seen.get(s) + ' and ' + t.id); seen.set(s, t.id); }
  if (plan.trips.length) for (const s of core) if (!seen.has(s)) errors.push(s + ' is not assigned to any trip');
  for (const s of seen.keys()) if (!core.includes(s)) errors.push(s + ' is not one of the forty');
  for (const t of plan.trips) {
    if (!windowMonths(t.window[0], t.window[1]).length) errors.push(t.id + ' has an invalid window');
    if (plan.deadline && t.window[1] > plan.deadline.slice(0, 7)) errors.push(t.id + ' ends after the deadline');
    for (const v of t.partner) for (const s of v.slots) if (!t.slots.includes(s)) errors.push(t.id + ' Partner leg ' + v.option + ' includes ' + s + ', which is not on this trip');
  }
  for (const s of core) if (!plan.bestMonths[s]) errors.push(s + ' has no best-months entry');
  return errors;
}

// Live checks against whatever is saved now (places can move between trips freely).
export function tripChecks(store, plan, FORTY, trip) {
  const months = windowMonths(trip.windowStart, trip.windowEnd);
  const entries = FORTY.entries.filter(e => store.get('fortyEntry', e.id)?.tripId === trip.id);
  const deadline = store.setting('fortyDeadline') || plan.deadline;
  const season = entries.map(e => { const b = bestFor(store, plan, e); const out = b ? months.filter(m => !b.months.includes(m)) : []; return { entry: e, best: b, outside: out }; });
  return {
    entries, months, season,
    seasonWarnings: season.filter(s => s.outside.length),
    afterDeadline: !!(trip.windowEnd && deadline && trip.windowEnd > deadline.slice(0, 7)),
    deadline,
  };
}
export function bestFor(store, plan, entry) {
  const own = store.get('place', entry.placeId)?.bestMonths;
  return Array.isArray(own?.months) ? own : plan.bestMonths[entry.id] || null;
}
export function unassigned(store, FORTY, selection) {
  const trips = new Set(store.list('trip').filter(t => t.planId).map(t => t.id));
  return selection.filter(id => !trips.has(store.get('fortyEntry', id)?.tripId));
}

// Operations that load the plan. Idempotent: identical creates replay as "duplicate", and nothing
// already saved is overwritten (existing trip groupings and settings are left as they are).
export function planOps(store, plan, FORTY) {
  const ops = [], has = (k, id) => !!store.get(k, id);
  const name = id => FORTY.entries.find(e => e.id === id)?.name || id;
  if (!store.get('setting', 'fortyDeadline')?.value) ops.push(store.get('setting', 'fortyDeadline') ? store.patchOp('setting', 'fortyDeadline', { value: plan.deadline }) : store.createOp('setting', { value: plan.deadline }, undefined, 'fortyDeadline'));
  for (const p of plan.travellers) if (!has('people', p.id)) ops.push(store.createOp('people', { id: p.id, name: p.name, fullName: p.fullName || '', born: p.born, homeAirport: p.homeAirport, allowance: p.allowance }));
  for (const t of plan.trips) {
    if (!has('trip', t.id)) ops.push(store.createOp('trip', { id: t.id, name: t.name, planId: plan.id, kind: t.kind, scope: t.slots.map(name).join(' · '), status: 'Idea', windowStart: t.window[0], windowEnd: t.window[1], lengthNote: t.length, startDate: '', travellers: null, budget: null, budgetCurrency: 'AUD', budgetBasis: 'for the party', notes: '', nextAction: 'Check seasons, permits and which legs Partner joins.', lat: null, lon: null, theme: FORTY.entries.find(e => e.id === t.slots[0])?.photoId || null, stops: [], adviceChecked: '', bookingNotes: '', countryQueries: [] }));
    const legs = [{ id: t.id + '-me', option: 'You', title: 'Whole trip', party: 'You', partner: 'n/a', length: t.length, flyIn: store.get('people', 'me')?.homeAirport || '', flyOut: store.get('people', 'me')?.homeAirport || '', places: t.slots.join(','), flag: '' },
      ...t.partner.map(v => ({ id: t.id + '-partner-' + v.option.toLowerCase(), option: 'Partner ' + v.option, title: v.title, party: 'You + Partner', partner: 'maybe', length: v.length, flyIn: v.flyIn, flyOut: v.flyOut, places: v.slots.join(','), flag: v.flag || '' }))];
    for (const l of legs) if (!has('segments', l.id)) ops.push(store.createOp('segments', { ...l, trip: t.id, start: '', end: '', notes: '' }));
    if (t.notes && !has('research', t.id + '-routing')) ops.push(store.createOp('research', { id: t.id + '-routing', trip: t.id, topic: 'Transport', title: 'Suggested routing and seasons', status: 'Needs checking', url: '', checked: '', review: '', notes: t.notes }));
    t.keyDates.forEach((k, i) => { const id = t.id + '-key-' + i; if (!has('reminders', id)) ops.push(store.createOp('reminders', { id, trip: t.id, title: k.title, date: k.date, kind: k.kind, state: 'Open', url: '', notes: 'From the plan. Check the official release schedule.' })); });
    for (const s of t.slots) { const pe = store.get('fortyEntry', s); if (!pe) ops.push(store.createOp('fortyEntry', { tripId: t.id }, undefined, s)); else if (!pe.tripId) ops.push(store.patchOp('fortyEntry', s, { tripId: t.id })); }
  }
  const folded = new Set();
  for (const t of plan.trips) for (const old of t.aliases) { const o = store.get('trip', old); if (o && !folded.has(old) && folded.add(old) && !(o.foldedInto || []).includes(t.id)) ops.push(store.patchOp('trip', old, { foldedInto: [...new Set([...(o.foldedInto || []), ...plan.trips.filter(x => x.aliases.includes(old)).map(x => x.id)])] })); }
  const master = store.get('trip', 'forty-before-forty');
  if (master && !has('task', 'plan-verify-best-months')) ops.push(store.createOp('task', { id: 'plan-verify-best-months', text: 'Check each place’s best months against a published source (they came from the plan brief).', done: false, due: '' }, 'forty-before-forty'));
  if (!store.get('setting', 'planLoaded')) ops.push(store.createOp('setting', { value: PLAN_MARKER }, undefined, 'planLoaded'));
  return ops.filter(Boolean);
}

// ---------- Phase 2: timeline, leave and availability ----------
export const PLAN_START = new Date().toISOString().slice(0, 7); // the timeline starts this month
export const monthIndex = (ym, from = PLAN_START) => (+ym.slice(0, 4) - +from.slice(0, 4)) * 12 + (+ym.slice(5, 7) - +from.slice(5, 7));
export const addMonths = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
const lastDay = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
export const windowDates = t => t.windowStart ? [t.windowStart + '-01', lastDay(t.windowEnd || t.windowStart)] : null;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5) + 1;
// "5 to 6 weeks" → 42 (the upper figure, so allowance warnings err on the cautious side). Blank → null.
export function lengthDays(text) {
  const n = String(text || '').match(/(\d+(?:\.\d+)?)/g); if (!n) return null;
  return Math.round(Math.max(...n.map(Number)) * (/day/i.test(text) ? 1 : 7));
}
export function legDays(leg, trip) {
  if (leg.start && leg.end) return daysBetween(leg.start, leg.end);
  return lengthDays(leg.length) ?? lengthDays(trip?.lengthNote);
}
// Planned days away per person per calendar year. Partner counts legs marked "yes"; "maybe" is shown apart.
export function leaveByYear(store) {
  const out = {}, add = (who, y, kind, d) => { const r = ((out[who] ??= {})[y] ??= { planned: 0, maybe: 0, unknown: 0 }); if (d == null) r.unknown++; else r[kind] += d; };
  for (const t of store.list('trip').filter(t => t.planId && t.windowStart)) {
    const y = (store.records('segments', t.id).find(l => l.option === 'You')?.start || t.windowStart).slice(0, 4);
    for (const l of store.records('segments', t.id)) {
      const d = legDays(l, t);
      if (l.option === 'You') add('me', y, 'planned', d);
      else if (l.partner === 'yes') add('partner', (l.start || t.windowStart).slice(0, 4), 'planned', d);
      else if (l.partner === 'maybe') add('partner', (l.start || t.windowStart).slice(0, 4), 'maybe', d);
    }
  }
  return out;
}
export function overlaps(a0, a1, b0, b1) { return a0 <= b1 && b0 <= a1; }
// Everything worth flagging on one trip. Flags never block anything.
export function tripFlags(store, plan, FORTY, t) {
  const flags = [], c = tripChecks(store, plan, FORTY, t), w = windowDates(t), people = store.list('people');
  if (c.seasonWarnings.length) flags.push({ kind: 'season', text: 'Outside best months: ' + c.seasonWarnings.map(s => s.entry.name).join(', ') });
  if (c.afterDeadline) flags.push({ kind: 'deadline', text: 'Ends after your forty date' });
  if (w) for (const b of store.list('blackouts')) if (b.start && b.end && overlaps(w[0], w[1], b.start, b.end)) flags.push({ kind: 'blackout', text: 'Overlaps “' + b.title + '” (' + (b.who || 'Both') + ')' });
  for (const l of store.records('segments', t.id)) {
    const who = l.option === 'You' ? people.find(p => p.id === 'me') : l.partner !== 'no' ? people.find(p => p.id === 'partner') : null, d = legDays(l, t);
    if (who?.maxDaysPerTrip && d != null && d > +who.maxDaysPerTrip) flags.push({ kind: 'leave', text: l.option + ' leg is about ' + d + ' days; ' + who.name + '’s comfortable maximum is ' + who.maxDaysPerTrip });
  }
  if (w) for (const p of people) if (p.passportExpiry) { const limit = new Date(w[1]); limit.setUTCMonth(limit.getUTCMonth() + 6); if (p.passportExpiry < limit.toISOString().slice(0, 10)) flags.push({ kind: 'passport', text: p.name + '’s passport expires ' + p.passportExpiry + ', within six months of this trip’s return' }); }
  return flags;
}
// How many of a trip's places are in season in a given month (0..1), for the timeline's shading.
export function seasonShare(store, plan, FORTY, t, month) {
  const es = FORTY.entries.filter(e => store.get('fortyEntry', e.id)?.tripId === t.id); if (!es.length) return 0;
  return es.filter(e => bestFor(store, plan, e)?.months.includes(month)).length / es.length;
}
export function phase2Ops(store) {
  const ops = [], set = { me: { maxDaysPerTrip: '56', allowanceNote: 'Comfortable with 4 to 8 weeks per trip' }, partner: { maxDaysPerTrip: '21', allowanceNote: 'Usually 2 to 3 weeks' } };
  for (const [id, v] of Object.entries(set)) { const p = store.get('people', id); if (p && !p.maxDaysPerTrip) ops.push(store.patchOp('people', id, v)); }
  if (!store.get('setting', 'planPhase2')) ops.push(store.createOp('setting', { value: 'phase2 v1' }, undefined, 'planPhase2'));
  return ops.filter(Boolean);
}

// ---------- Phase 5: fare watching, permit key dates, official link tasks ----------
export function phase5Ops(store, plan) {
  const ops = [], has = (k, id) => !!store.get(k, id);
  for (const t of plan.trips) {
    const trip = store.get('trip', t.id); if (!trip?.windowStart) continue;
    const id = t.id + '-fares', d = addMonths(trip.windowStart, -11) + '-01';
    if (!has('reminders', id)) ops.push(store.createOp('reminders', { id, trip: t.id, title: 'Start watching long-haul fares (9 to 11 months out)', date: d, kind: 'Other', state: 'Open', url: '', notes: 'Log fares you see on the Deals board; set a target per route.' }));
    for (const w of plan.permitWatch || []) if (t.slots.includes(w.entry)) { const rid = t.id + '-permit-' + w.entry; if (!has('reminders', rid)) ops.push(store.createOp('reminders', { id: rid, trip: t.id, title: w.title, date: addMonths(trip.windowStart, -12) + '-01', kind: 'Ticket release', state: 'Open', url: (plan.officialLinks?.[w.entry] || [])[0]?.url || '', notes: 'Release schedules change; check the official source.' })); }
  }
  if (store.get('trip', 'forty-before-forty')) (plan.linkTasks || []).forEach((x, i) => { const id = 'plan-link-' + x.entry + '-' + i; if (!has('task', id)) ops.push(store.createOp('task', { id, text: x.text, done: false, due: '' }, 'forty-before-forty')); });
  if (!store.get('setting', 'planPhase5')) ops.push(store.createOp('setting', { value: 'phase5 v1' }, undefined, 'planPhase5'));
  return ops.filter(Boolean);
}

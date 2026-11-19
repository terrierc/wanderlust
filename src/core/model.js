// Wanderlust data model shared by the Worker and the browser client.
// The Worker build concatenates this file after stripping `export`, so it must stay dependency-free.

export const HUB_KINDS = ['preferences', 'legs', 'days', 'research', 'bookings', 'votes', 'journal', 'reminders', 'contacts', 'phrases', 'requests', 'segments', 'people', 'blackouts', 'savings', 'settlements', 'fares', 'fareTargets'];
export const PLACE_STATUSES = ['Unconfirmed', 'Confirm visit', 'Want to go', 'Planning', 'Booked', 'Visited'];
export const TRIP_STATUSES = ['Idea', 'Researching', 'Planning', 'Booked', 'Completed', 'On hold'];
export const COUNTRY_STATUSES = ['Visited', 'Limited visit', 'Want to go'];
const ID_RE = /^[a-z0-9-]{1,90}$/;
const PLACE_ID_RE = /^[a-zA-Z0-9-]{1,90}$/;

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  if (typeof a !== typeof b || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  return ka.length === kb.length && ka.every(k => deepEqual(a[k], b[k]));
}
// A field that was never set and a field set to null both mean "not decided".
const same = (a, b) => (a === undefined || a === null) && (b === undefined || b === null) ? true : deepEqual(a, b);
export const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const str = (x, n) => typeof x === 'string' && x.length <= n;

// ---------- validators (error string, or null when valid) ----------
export function validatePlace(p) {
  if (!p || typeof p !== 'object') return 'Invalid place';
  if (p.deleted === true) return PLACE_ID_RE.test(p.id || '') ? null : 'Invalid id';
  if (!PLACE_ID_RE.test(p.id || '') || typeof p.name !== 'string' || !p.name || p.name.length > 150) return 'Invalid place';
  if (!Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lon) || Math.abs(p.lon) > 180) return 'Invalid coordinates';
  if (!Number.isInteger(p.nights) || p.nights < 1 || p.nights > 60 || !Array.isArray(p.route)) return 'Invalid place';
  if (p.status !== undefined && !PLACE_STATUSES.includes(p.status)) return 'Invalid travel status';
  if (JSON.stringify(p).length > 100000) return 'Record too large';
  return null;
}
export function validateProfile(p) {
  if (!p || p.schemaVersion !== 1 || !Array.isArray(p.countries) || p.countries.length > 300 || !Array.isArray(p.trips) || p.trips.length > 100) return 'Invalid profile';
  if (p.countries.some(c => !str(c.code, 20) || !str(c.name, 100) || !((c.lat === null && c.lon === null) || (Number.isFinite(c.lat) && Math.abs(c.lat) <= 90 && Number.isFinite(c.lon) && Math.abs(c.lon) <= 180)) || !COUNTRY_STATUSES.includes(c.status) || !str(c.notes || '', 10000))) return 'Invalid country history';
  if (new Set(p.countries.map(c => c.code)).size !== p.countries.length) return 'Duplicate country';
  const money = v => v === null || v === undefined || (Number.isFinite(v) && v >= 0);
  if (p.trips.some(t => !str(t.id, 90) || !str(t.name, 150) || !TRIP_STATUSES.includes(t.status) || !Array.isArray(t.stops) || t.stops.length > 100 || t.stops.some(s => !str(s.id, 90) || !str(s.name, 150) || !Number.isInteger(s.nights) || s.nights < 1 || s.nights > 90) || !Array.isArray(t.costs) || t.costs.length > 200 || t.costs.some(c => !str(c.item, 150) || !money(c.total) || !money(c.paid) || !money(c.myShare)) || !Array.isArray(t.tasks) || t.tasks.length > 200 || (t.budget !== null && t.budget !== undefined && (!Number.isFinite(t.budget) || t.budget < 0)))) return 'Invalid trip';
  if (new Set(p.trips.map(t => t.id)).size !== p.trips.length) return 'Duplicate trip';
  for (const t of p.trips) for (const k of ['costs', 'tasks']) { const ids = t[k].map(x => x.id).filter(Boolean); if (new Set(ids).size !== ids.length) return 'Duplicate ' + k.slice(0, -1); }
  if (JSON.stringify(p).length > 400000) return 'Profile too large';
  return null;
}
export function normaliseHub(h) {
  const out = { version: 1, records: {} };
  for (const k of HUB_KINDS) out.records[k] = Array.isArray(h?.records?.[k]) ? h.records[k] : [];
  return out;
}
export function validateHub(p) {
  if (!p || p.version !== 1 || !p.records || typeof p.records !== 'object') return 'Invalid workspace';
  if (Object.keys(p.records).some(k => !HUB_KINDS.includes(k))) return 'Invalid workspace';
  for (const a of Object.values(p.records)) {
    if (!Array.isArray(a) || a.length > 1000 || new Set(a.map(r => r?.id)).size !== a.length) return 'Invalid workspace';
    if (a.some(r => !r || typeof r.id !== 'string' || !ID_RE.test(r.id) || Object.values(r).some(v => typeof v !== 'string' && typeof v !== 'boolean'))) return 'Invalid workspace';
  }
  if (JSON.stringify(p).length > 2000000) return 'Workspace too large';
  return null;
}
export function validateForty(p, catalogue) {
  if (!p || p.version !== 1 || Object.keys(p).some(k => !['version', 'selection', 'personal', 'extras'].includes(k))) return 'Invalid collection';
  const extras = p.extras ?? [];
  if (!Array.isArray(extras) || extras.length > 100 || extras.some(e => !e || !/^extra-[a-z0-9-]{1,80}$/.test(e.id) || !str(e.name, 150) || !e.name || !str(e.country || '', 150) || !str(e.experience || '', 1000) || !str(e.placeId || '', 90))) return 'Invalid optional destination';
  if (new Set(extras.map(e => e.id)).size !== extras.length) return 'Duplicate optional destination';
  const allowed = new Set([...catalogue.entries.filter(e => ['core', 'optional'].includes(e.group)).map(e => e.id), ...extras.map(e => e.id)]);
  if (!Array.isArray(p.selection) || p.selection.length !== 40 || new Set(p.selection).size !== 40 || p.selection.some(id => !allowed.has(id))) return 'Choose exactly 40 unique core or optional destinations';
  const all = new Set([...catalogue.entries.map(e => e.id), ...extras.map(e => e.id)]);
  const personal = p.personal ?? {};
  if (typeof personal !== 'object' || Array.isArray(personal)) return 'Invalid collection notes';
  for (const [k, v] of Object.entries(personal)) {
    if (!all.has(k) || !v || typeof v !== 'object' || Array.isArray(v)) return 'Invalid collection notes';
    if (Object.values(v).some(x => !(x === null || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)) || str(x, 10000)))) return 'Invalid collection notes';
  }
  if (JSON.stringify(p).length > 300000) return 'Collection too large';
  return null;
}
export function validateSettings(p) {
  if (!p || p.version !== 1 || !p.values || typeof p.values !== 'object' || Array.isArray(p.values)) return 'Invalid settings';
  const entries = Object.entries(p.values);
  if (entries.length > 200 || entries.some(([k, v]) => !/^[a-zA-Z0-9-]{1,60}$/.test(k) || !(v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || str(v, 10000)))) return 'Invalid settings';
  return null;
}

// Stable identities for nested records that historically had none. Deterministic, so every
// device derives the same IDs from the same saved array until the IDs are persisted.
export function ensureProfileIds(profile) {
  for (const t of profile.trips || []) {
    (t.costs || []).forEach((c, i) => { if (!c.id) c.id = (t.id + '-cost-' + i).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90); });
    (t.tasks || []).forEach((x, i) => { if (!x.id) x.id = (t.id + '-task-' + i).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90); });
  }
  return profile;
}

// ---------- entity addressing ----------
// docs = { places: Map<id, object>, profile, hub, forty, settings, dirty: Set<container>, dirtyPlaces: Set<id> }
const CONTAINER = kind => kind === 'place' ? 'places' : ['country', 'trip', 'cost', 'task'].includes(kind) ? 'profile' : HUB_KINDS.includes(kind) ? 'hub' : ['fortyEntry', 'fortyExtra', 'fortySelection'].includes(kind) ? 'forty' : kind === 'setting' ? 'settings' : null;
export const containerOf = CONTAINER;
function list(docs, kind, parent) {
  if (kind === 'country') return docs.profile.countries;
  if (kind === 'trip') return docs.profile.trips;
  if (kind === 'cost' || kind === 'task') { const t = docs.profile.trips.find(t => t.id === parent); return t ? t[kind + 's'] : null; }
  if (HUB_KINDS.includes(kind)) return docs.hub.records[kind];
  if (kind === 'fortyExtra') return (docs.forty.extras ??= []);
  return null;
}
const keyOf = kind => kind === 'country' ? 'code' : 'id';
export function getEntity(docs, kind, id, parent) {
  if (kind === 'place') { const p = docs.places.get(id); return p && !p.deleted ? p : undefined; }
  if (kind === 'fortyEntry') return docs.forty.personal?.[id];
  if (kind === 'setting') return Object.prototype.hasOwnProperty.call(docs.settings.values, id) ? { value: docs.settings.values[id] } : undefined;
  const l = list(docs, kind, parent); if (!l) return undefined;
  return l.find(x => x[keyOf(kind)] === id);
}
function putEntity(docs, kind, id, parent, obj) {
  if (kind === 'place') { docs.places.set(id, obj); docs.dirtyPlaces.add(id); return; }
  if (kind === 'fortyEntry') { (docs.forty.personal ??= {})[id] = obj; return; }
  if (kind === 'setting') { docs.settings.values[id] = obj.value ?? null; return; }
  const l = list(docs, kind, parent); if (!l) throw new Error('Parent journey not found');
  const i = l.findIndex(x => x[keyOf(kind)] === id); if (i >= 0) l[i] = obj; else l.push(obj);
}
function removeEntity(docs, kind, id, parent) {
  if (kind === 'place') { docs.places.set(id, { id, deleted: true, deletedAt: new Date().toISOString() }); docs.dirtyPlaces.add(id); return; }
  if (kind === 'fortyEntry') { delete docs.forty.personal?.[id]; return; }
  if (kind === 'setting') { delete docs.settings.values[id]; return; }
  const l = list(docs, kind, parent); if (!l) return;
  const i = l.findIndex(x => x[keyOf(kind)] === id); if (i >= 0) l.splice(i, 1);
}
const FORBIDDEN_TRIP_FIELDS = ['costs', 'tasks', 'id'];

// Apply one operation. Idempotent by value: replaying an operation whose effect is already
// present reports "duplicate"; an operation whose base no longer matches reports "conflict".
export function applyOp(docs, op, ctx = {}) {
  const res = { opId: op.opId, kind: op.kind, id: op.id, parent: op.parent };
  const container = CONTAINER(op.kind);
  if (!container || typeof op.opId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(op.opId)) return { ...res, status: 'rejected', reason: 'Unknown operation' };
  const before = container === 'places' ? null : clone(docs[container]);
  const beforePlace = container === 'places' ? clone(docs.places.get(op.id)) : null;
  const restore = () => { if (container === 'places') { if (beforePlace === undefined) docs.places.delete(op.id); else docs.places.set(op.id, beforePlace); } else docs[container] = before; };
  try {
    let status = 'applied';
    if (op.action === 'swap') {
      const sel = docs.forty.selection;
      if (sel.includes(op.in) && !sel.includes(op.out)) status = 'duplicate';
      else if (sel.includes(op.out) && !sel.includes(op.in)) sel[sel.indexOf(op.out)] = op.in;
      else return { ...res, status: 'conflict', reason: 'The forty changed on another device.', current: clone(sel) };
    } else {
      const cur = getEntity(docs, op.kind, op.id, op.parent);
      if (op.action === 'create') {
        const entity = clone(op.entity);
        if (!entity || typeof entity !== 'object') return { ...res, status: 'rejected', reason: 'Missing record' };
        if (op.kind !== 'setting' && op.kind !== 'fortyEntry' && entity[keyOf(op.kind)] !== op.id) return { ...res, status: 'rejected', reason: 'Record ID mismatch' };
        const comparable = op.kind === 'trip' && cur ? (({ costs, tasks, ...rest }) => rest)(cur) : cur;
        if (cur) { if (deepEqual(comparable, entity)) status = 'duplicate'; else return { ...res, status: 'conflict', reason: 'A record with this ID already exists.', current: clone(cur) }; }
        else putEntity(docs, op.kind, op.id, op.parent, op.kind === 'trip' ? { ...entity, costs: [], tasks: [] } : entity);
      } else if (op.action === 'patch') {
        if (!cur) return { ...res, status: 'conflict', reason: 'This record was removed on another device.', current: null };
        const set = op.set || {}, base = op.base || {};
        if (op.kind === 'trip' && Object.keys(set).some(k => FORBIDDEN_TRIP_FIELDS.includes(k))) return { ...res, status: 'rejected', reason: 'Edit costs and tasks individually' };
        if (Object.keys(set).some(k => k === 'id' || k === 'code')) return { ...res, status: 'rejected', reason: 'IDs cannot change' };
        const fields = Object.keys(set), conflicts = [];
        let pending = false;
        for (const f of fields) {
          if (same(cur[f], set[f])) continue;
          if (same(cur[f], base[f])) pending = true; else conflicts.push(f);
        }
        if (conflicts.length) return { ...res, status: 'conflict', reason: 'Changed on another device: ' + conflicts.join(', '), fields: conflicts, current: clone(cur) };
        if (!pending) status = 'duplicate';
        else { const next = { ...cur }; for (const f of fields) { if (set[f] === null && op.unset?.includes(f)) delete next[f]; else next[f] = clone(set[f]); } putEntity(docs, op.kind, op.id, op.parent, next); }
      } else if (op.action === 'delete') {
        if (!cur) status = 'duplicate';
        else if (op.base && !deepEqual(cur, op.base)) return { ...res, status: 'conflict', reason: 'Changed on another device before it was removed.', current: clone(cur) };
        else removeEntity(docs, op.kind, op.id, op.parent);
      } else return { ...res, status: 'rejected', reason: 'Unknown action' };
    }
    if (status === 'applied') {
      const err = container === 'places' ? validatePlace(docs.places.get(op.id)) : container === 'profile' ? validateProfile(docs.profile) : container === 'hub' ? validateHub(docs.hub) : container === 'forty' ? validateForty(docs.forty, ctx.fortyCatalogue) : validateSettings(docs.settings);
      if (err) { restore(); if (container === 'places') docs.dirtyPlaces.delete(op.id); return { ...res, status: 'rejected', reason: err }; }
      docs.dirty.add(container);
    }
    return { ...res, status };
  } catch (e) { restore(); return { ...res, status: 'rejected', reason: e.message || 'Could not apply change' }; }
}

// Flatten saved documents into addressable entities (used by the client store).
export function entitiesFrom(docs) {
  const out = [];
  for (const [id, p] of docs.places) if (!p.deleted) out.push({ kind: 'place', id, data: p });
  docs.profile.countries.forEach((c, i) => out.push({ kind: 'country', id: c.code, order: i, data: c }));
  docs.profile.trips.forEach((t, i) => {
    const { costs, tasks, ...rest } = t;
    out.push({ kind: 'trip', id: t.id, order: i, data: rest });
    costs.forEach((c, j) => out.push({ kind: 'cost', id: c.id, parent: t.id, order: j, data: c }));
    tasks.forEach((x, j) => out.push({ kind: 'task', id: x.id, parent: t.id, order: j, data: x }));
  });
  for (const k of HUB_KINDS) docs.hub.records[k].forEach((r, i) => out.push({ kind: k, id: r.id, order: i, data: r }));
  for (const [id, v] of Object.entries(docs.forty.personal || {})) out.push({ kind: 'fortyEntry', id, data: v });
  (docs.forty.extras || []).forEach((e, i) => out.push({ kind: 'fortyExtra', id: e.id, order: i, data: e }));
  out.push({ kind: 'fortySelection', id: 'selection', data: { selection: docs.forty.selection } });
  for (const [id, value] of Object.entries(docs.settings.values)) out.push({ kind: 'setting', id, data: { value } });
  return out;
}

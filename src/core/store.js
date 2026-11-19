// Local source of truth. Every edit is committed to IndexedDB (entity + outbox operation in one
// transaction) before anything is sent to the network.
import { clone, deepEqual, entitiesFrom, ensureProfileIds, normaliseHub, HUB_KINDS } from './model.js';

export const K = (kind, id) => kind + ':' + id;
const uuid = () => crypto.randomUUID();
export const newId = prefix => (prefix ? prefix + '-' : '') + uuid().replace(/-/g, '').slice(0, 20);

// Apply an operation to the in-memory entity map (local view only; the server decides conflicts).
export function applyLocal(map, op) {
  const changed = [];
  if (op.action === 'swap') {
    const r = map.get(K('fortySelection', 'selection'));
    const sel = [...(r?.data.selection || [])];
    const i = sel.indexOf(op.out);
    if (i >= 0 && !sel.includes(op.in)) sel[i] = op.in;
    const next = { ...(r || { k: K('fortySelection', 'selection'), kind: 'fortySelection', id: 'selection' }), data: { selection: sel } };
    map.set(next.k, next); changed.push(next);
    return changed;
  }
  const k = K(op.kind, op.id), cur = map.get(k);
  if (op.action === 'create') {
    const order = Math.max(-1, ...[...map.values()].filter(r => r.kind === op.kind && r.parent === op.parent).map(r => r.order ?? 0)) + 1;
    const rec = { k, kind: op.kind, id: op.id, parent: op.parent, order, data: clone(op.entity), server: cur?.server ?? null };
    map.set(k, rec); changed.push(rec);
  } else if (op.action === 'patch') {
    if (!cur) return changed;
    const rec = { ...cur, data: { ...cur.data, ...clone(op.set) } };
    map.set(k, rec); changed.push(rec);
  } else if (op.action === 'delete') {
    if (cur) { map.delete(k); changed.push({ k, deleted: true }); }
  }
  return changed;
}

export class Store extends EventTarget {
  constructor(db, { space, localOnly = false }) { super(); this.db = db; this.space = space; this.localOnly = localOnly; this.map = new Map(); this.pending = 0; this.conflicts = 0; this.meta = {}; }

  async load() {
    const [ents, meta, outbox, conflicts] = await this.db.tx(['entities', 'meta', 'outbox', 'conflicts'], 'readonly', s => Promise.all([s.entities.all(), s.meta.all(), s.outbox.count(), s.conflicts.count()]));
    this.map = new Map(ents.map(r => [r.k, r]));
    this.meta = Object.fromEntries(meta.map(m => [m.key, m.value]));
    this.pending = outbox; this.conflicts = conflicts;
    return this;
  }
  get isEmpty() { return this.map.size === 0; }
  async setMeta(key, value) { this.meta[key] = value; await this.db.put('meta', { key, value }); }

  // ---------- reads ----------
  rec(kind, id) { return this.map.get(K(kind, id)); }
  get(kind, id) { return this.map.get(K(kind, id))?.data; }
  list(kind, parent) {
    const out = [];
    for (const r of this.map.values()) if (r.kind === kind && (parent === undefined || r.parent === parent)) out.push(r);
    return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(r => r.data);
  }
  records(kind, trip) { return this.list(kind).filter(r => trip === undefined || r.trip === trip); }
  setting(id, fallback = '') { const v = this.get('setting', id)?.value; return v === undefined || v === null ? fallback : v; }

  // Rebuild the saved-document shapes (exports, backups, agent briefs).
  toDocs() {
    const trips = this.list('trip').map(t => ({ ...t, costs: this.list('cost', t.id), tasks: this.list('task', t.id) }));
    const hub = { version: 1, records: Object.fromEntries(HUB_KINDS.map(k => [k, this.list(k)])) };
    const personal = {}; for (const r of this.map.values()) if (r.kind === 'fortyEntry') personal[r.id] = r.data;
    const settings = { version: 1, values: {} }; for (const r of this.map.values()) if (r.kind === 'setting') settings.values[r.id] = r.data.value;
    return {
      places: this.list('place'), deletedPlaces: this.meta.deletedPlaces || [],
      profile: { schemaVersion: 1, countries: this.list('country'), trips },
      hub, forty: { version: 1, selection: this.get('fortySelection', 'selection')?.selection || [], personal, extras: this.list('fortyExtra') }, settings,
    };
  }

  // ---------- writes ----------
  async commit(ops) {
    ops = (Array.isArray(ops) ? ops : [ops]).filter(Boolean);
    if (!ops.length) return;
    const changed = [];
    const next = new Map(this.map);
    for (const op of ops) changed.push(...applyLocal(next, op));
    await this.db.tx(['entities', 'outbox'], 'readwrite', async s => {
      for (const c of changed) c.deleted ? await s.entities.del(c.k) : await s.entities.put(c);
      if (!this.localOnly) for (const op of ops) await s.outbox.add({ opId: op.opId, op, state: 'pending', attempts: 0, nextAttempt: 0, createdAt: op.at });
    });
    this.map = next;
    if (!this.localOnly) this.pending += ops.length;
    this.emit(ops.map(o => o.kind));
  }
  op(kind, id, action, extra = {}) { return { opId: uuid(), at: new Date().toISOString(), kind, id, action, ...extra }; }
  patchOp(kind, id, set, parent) {
    const cur = this.get(kind, id); if (!cur) throw new Error('This record is no longer on this device.');
    const changes = {}, base = {};
    for (const [f, v] of Object.entries(set)) if (!deepEqual(cur[f], v)) { changes[f] = v === undefined ? null : v; base[f] = cur[f] === undefined ? null : clone(cur[f]); }
    if (!Object.keys(changes).length) return null;
    return this.op(kind, id, 'patch', { parent, set: changes, base });
  }
  patch(kind, id, set, parent) { return this.commit(this.patchOp(kind, id, set, parent ?? this.rec(kind, id)?.parent)); }
  createOp(kind, entity, parent, id) { id ??= kind === 'country' ? entity.code : entity.id; return this.op(kind, id, 'create', { parent, entity: clone(entity) }); }
  create(kind, entity, parent, id) { return this.commit(this.createOp(kind, entity, parent, id)); }
  removeOp(kind, id) { const r = this.rec(kind, id); if (!r) return null; return this.op(kind, id, 'delete', { parent: r.parent, base: clone(r.data) }); }
  remove(kind, id) { return this.commit(this.removeOp(kind, id)); }
  swap(outId, inId) { return this.commit(this.op('fortySelection', 'selection', 'swap', { out: outId, in: inId })); }
  setSetting(id, value) { return this.get('setting', id) ? this.patch('setting', id, { value }) : this.create('setting', { value }, undefined, id); }

  // ---------- replace local state from a server snapshot (or seed), replaying unsent edits ----------
  async replaceFrom(snapshot, { revisions = null, seeded = false } = {}) {
    const places = new Map(snapshot.places.map(p => [p.id, p]));
    const docs = { places, profile: ensureProfileIds(clone(snapshot.profile)), hub: normaliseHub(snapshot.hub), forty: clone(snapshot.forty), settings: clone(snapshot.settings || { version: 1, values: {} }) };
    const map = new Map();
    for (const e of entitiesFrom(docs)) { const k = K(e.kind, e.id); map.set(k, { k, kind: e.kind, id: e.id, parent: e.parent, order: e.order, data: clone(e.data), server: seeded ? null : e.data }); }
    const outbox = await this.db.all('outbox');
    for (const o of outbox.sort((a, b) => a.seq - b.seq)) if (o.state !== 'conflict' && o.state !== 'rejected') applyLocal(map, o.op);
    const deletedPlaces = snapshot.places.filter(p => p.deleted).map(p => p.id);
    await this.db.tx(['entities', 'meta'], 'readwrite', async s => {
      await s.entities.clear();
      for (const r of map.values()) await s.entities.put(r);
      await s.meta.put({ key: 'deletedPlaces', value: deletedPlaces });
      if (revisions) await s.meta.put({ key: 'revisions', value: revisions });
      await s.meta.put({ key: seeded ? 'seededAt' : 'lastPull', value: new Date().toISOString() });
    });
    this.map = map; this.meta.deletedPlaces = deletedPlaces; if (revisions) this.meta.revisions = revisions;
    this.meta[seeded ? 'seededAt' : 'lastPull'] = new Date().toISOString();
    this.emit(['*']);
  }
  // Insert newly bundled catalogue places only; never overwrite saved records or revive deleted ones.
  async addMissingSeedPlaces(seed) {
    const deleted = new Set(this.meta.deletedPlaces || []);
    const missing = seed.filter(p => !this.map.has(K('place', p.id)) && !deleted.has(p.id));
    if (!missing.length) return 0;
    await this.db.tx('entities', 'readwrite', async s => { let order = this.list('place').length; for (const p of missing) { const r = { k: K('place', p.id), kind: 'place', id: p.id, order: order++, data: clone(p), server: null }; await s.entities.put(r); this.map.set(r.k, r); } });
    this.emit(['place']);
    return missing.length;
  }
  async refreshCounts() { const [o, c] = await this.db.tx(['outbox', 'conflicts'], 'readonly', s => Promise.all([s.outbox.count(), s.conflicts.count()])); this.pending = o; this.conflicts = c; this.emit(['sync']); }
  emit(kinds) { this.dispatchEvent(new CustomEvent('change', { detail: { kinds } })); }
}

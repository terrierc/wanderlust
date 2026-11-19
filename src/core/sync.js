// Cloud sync engine: uploads attachment bytes, pushes the durable outbox, then pulls the saved state.
// Background Sync (where supported) only triggers this same flush; it is an enhancement, not a dependency.
import { K } from './store.js';
import { entitiesFrom, ensureProfileIds, normaliseHub, deepEqual, clone } from './model.js';
import { sha256 } from './files.js';

const FILE_FIELDS = ['file'];
export class Sync extends EventTarget {
  constructor(store, { localOnly = false, base = '' } = {}) {
    super(); this.store = store; this.localOnly = localOnly; this.base = base;
    this.state = localOnly ? 'local' : 'idle'; this.error = ''; this.failures = 0; this.running = null; this.timer = null;
  }
  get status() { return { state: this.state, error: this.error, pending: this.store.pending, conflicts: this.store.conflicts, lastPull: this.store.meta.lastPull, filesWaiting: this.filesWaiting || 0 }; }
  set(state, error = '') { this.state = state; this.error = error; this.dispatchEvent(new CustomEvent('status', { detail: this.status })); }

  async request(path, init = {}) {
    let res;
    try { res = await fetch(this.base + path, { credentials: 'same-origin', redirect: 'manual', cache: 'no-store', ...init }); }
    catch { throw Object.assign(new Error('No connection'), { kind: 'offline' }); }
    if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 0) throw Object.assign(new Error('Sign in again to sync'), { kind: 'auth' });
    const type = res.headers.get('Content-Type') || '';
    if (res.status >= 500) { let msg = 'The site is unavailable right now'; try { if (type.includes('json')) msg = (await res.json()).error || msg; } catch {} throw Object.assign(new Error(msg), { kind: 'server', status: res.status }); }
    if (init.raw) { if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { kind: res.status >= 500 ? 'server' : 'client', status: res.status }); return res; }
    if (!type.includes('application/json')) throw Object.assign(new Error('Sign in again to sync'), { kind: 'auth' });
    const body = await res.json();
    if (!res.ok) throw Object.assign(new Error(body.error || 'Sync failed'), { kind: res.status >= 500 || res.status === 409 ? 'server' : 'client', status: res.status });
    return body;
  }

  schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.run('retry'), ms); }
  soon() { clearTimeout(this.soonTimer); this.soonTimer = setTimeout(() => this.run('edit'), 1200); }

  run(reason = 'manual') {
    if (this.localOnly) { this.set('local'); return Promise.resolve(); }
    // Resolves only when every requested flush (including ones asked for meanwhile) has finished.
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => { let r = reason; do { this.again = false; await this.flush(r); r = 'again'; } while (this.again); })().finally(() => { this.running = null; });
    return this.running;
  }

  async flush(reason) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.set('offline'); return; }
    this.set('syncing');
    try {
      await this.uploadFiles();
      await this.push();
      const snap = await this.request('/api/sync/pull');
      if (snap.space !== this.store.space) { this.set('account', 'This site belongs to a different Wanderlust account than this device copy.'); this.dispatchEvent(new CustomEvent('space-mismatch', { detail: snap.space })); return; }
      await this.reconcileRestore(snap);
      await this.store.replaceFrom(snap, { revisions: snap.revisions });
      await this.deleteOrphanedRemoteFiles();
      await this.store.refreshCounts();
      this.failures = 0;
      this.set(this.store.conflicts ? 'conflict' : this.store.pending ? 'pending' : 'synced');
      if (this.store.pending && reason !== 'again') this.schedule(5000);
    } catch (e) {
      await this.store.refreshCounts().catch(() => {});
      if (e.kind === 'auth') this.set('signed-out', e.message);
      else if (e.kind === 'offline') { this.set('offline'); }
      else {
        this.failures++;
        const delay = Math.min(300000, 2000 * 2 ** this.failures) * (0.75 + Math.random() * 0.5);
        this.set('error', e.message || 'Sync failed'); this.schedule(delay);
      }
    }
  }

  // After a backup restore, offer the differences as one decision instead of silently picking a side.
  // Only creates and edits are proposed: records that exist only in the cloud are never deleted.
  async reconcileRestore(snap) {
    const r = this.store.meta.restoredFrom;
    if (!r || r.reconciled) return;
    const docs = { places: new Map(snap.places.map(p => [p.id, p])), profile: ensureProfileIds(clone(snap.profile)), hub: normaliseHub(snap.hub), forty: snap.forty, settings: snap.settings };
    const server = new Map(entitiesFrom(docs).map(e => [K(e.kind, e.id), e]));
    const ops = [];
    for (const rec of this.store.map.values()) {
      const sv = server.get(rec.k), now = new Date().toISOString(), opId = () => crypto.randomUUID();
      if (rec.kind === 'fortySelection') {
        const cur = sv?.data.selection || [], want = rec.data.selection;
        want.forEach(id => { if (!cur.includes(id)) { const out = cur.find(x => !want.includes(x) && !ops.some(o => o.out === x)); if (out) ops.push({ opId: opId(), at: now, kind: 'fortySelection', id: 'selection', action: 'swap', out, in: id }); } });
        continue;
      }
      if (!sv) { ops.push({ opId: opId(), at: now, kind: rec.kind, id: rec.id, parent: rec.parent, action: 'create', entity: clone(rec.data) }); continue; }
      const set = {}, base = {};
      for (const f of new Set([...Object.keys(rec.data), ...Object.keys(sv.data)])) if (!deepEqual(rec.data[f], sv.data[f])) { set[f] = rec.data[f] ?? null; base[f] = sv.data[f] ?? null; }
      if (Object.keys(set).length) ops.push({ opId: opId(), at: now, kind: rec.kind, id: rec.id, parent: rec.parent, action: 'patch', set, base });
    }
    if (ops.length) await this.store.db.put('conflicts', { opId: 'restore-' + Date.now(), op: { kind: 'restore', id: 'backup', action: 'restore' }, ops, status: 'restore', reason: 'Your restored backup (' + new Date(r.createdAt).toLocaleString('en-AU') + ') differs from the cloud copy in ' + ops.length + ' record' + (ops.length === 1 ? '' : 's') + '.', at: new Date().toISOString() });
    await this.store.setMeta('restoredFrom', { ...r, reconciled: true });
  }

  async uploadFiles() {
    const files = (await this.store.db.all('files')).filter(f => !f.uploaded && f.blob);
    this.filesWaiting = files.length;
    for (const f of files) {
      await this.request('/api/document/' + f.id, { method: 'PUT', body: f.blob, headers: { 'Content-Type': f.type, 'X-File-Name': encodeURIComponent(f.name), 'X-Content-SHA256': f.sha256 } })
        .catch(e => { if (e.kind === 'client') { f.error = e.message; return this.store.db.put('files', f).then(() => { throw Object.assign(new Error('“' + f.name + '” could not be uploaded: ' + e.message), { kind: 'server' }); }); } throw e; });
      f.uploaded = true; f.error = ''; await this.store.db.put('files', f); this.filesWaiting--;
    }
  }

  async push() {
    for (let round = 0; round < 20; round++) {
      const [outbox, conflicts, files] = await this.store.db.tx(['outbox', 'conflicts', 'files'], 'readonly', s => Promise.all([s.outbox.all(), s.conflicts.all(), s.files.all()]));
      if (!outbox.length) return;
      const blocked = new Set(conflicts.map(c => K(c.op.kind, c.op.id)));
      const notUploaded = new Set(files.filter(f => !f.uploaded).map(f => f.id));
      const ready = [];
      for (const o of outbox.sort((a, b) => a.seq - b.seq)) {
        const key = K(o.op.kind, o.op.id);
        const refs = [o.op.entity, o.op.set].filter(Boolean).flatMap(x => FILE_FIELDS.map(f => x[f])).filter(Boolean);
        if (blocked.has(key) || refs.some(id => notUploaded.has(id))) { blocked.add(key); continue; }
        ready.push(o); if (ready.length >= 100) break;
      }
      if (!ready.length) return;
      const { results } = await this.request('/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: ready.map(o => o.op) }) });
      const byId = new Map(results.map(r => [r.opId, r]));
      await this.store.db.tx(['outbox', 'conflicts', 'meta'], 'readwrite', async s => {
        const deletes = (await s.meta.get('remoteFileDeletes'))?.value || [];
        for (const o of ready) {
          const r = byId.get(o.opId); if (!r) continue;
          if (r.status === 'applied' || r.status === 'duplicate') {
            await s.outbox.del(o.seq);
            const old = o.op.action === 'delete' ? o.op.base?.file : o.op.action === 'patch' && o.op.set?.file !== undefined ? o.op.base?.file : null;
            if (old) deletes.push(old);
          } else {
            await s.outbox.del(o.seq);
            await s.conflicts.put({ opId: o.opId, op: o.op, status: r.status, reason: r.reason, fields: r.fields || [], current: r.current ?? null, at: new Date().toISOString() });
          }
        }
        await s.meta.put({ key: 'remoteFileDeletes', value: deletes });
      });
      if (ready.length < 100) return;
    }
  }

  // A replaced or removed attachment is deleted from the cloud only once no saved record still refers to it.
  async deleteOrphanedRemoteFiles() {
    const list = (await this.store.db.get('meta', 'remoteFileDeletes'))?.value || [];
    if (!list.length) return;
    const referenced = new Set(Object.values(this.store.toDocs().hub.records).flat().map(r => r.file).filter(Boolean));
    const keep = [];
    for (const id of list) {
      if (referenced.has(id)) continue;
      try { await this.request('/api/document/' + id, { method: 'DELETE', headers: {} }); const f = await this.store.db.get('files', id); if (f) await this.store.db.del('files', id); }
      catch (e) { if (e.kind !== 'client') keep.push(id); }
    }
    await this.store.setMeta('remoteFileDeletes', keep);
  }

  // Fetch an attachment's bytes into this device and verify them.
  async downloadFile(id, meta = {}) {
    const existing = await this.store.db.get('files', id);
    if (existing?.blob) return existing;
    if (this.localOnly) throw new Error('This file is not stored on this device.');
    const res = await this.request('/api/document/' + id, { raw: true });
    const blob = await res.blob();
    const sum = await sha256(blob), claimed = res.headers.get('X-Content-SHA256') || meta.sha256;
    if (claimed && claimed !== sum) throw new Error('Downloaded file failed its integrity check.');
    const rec = { id, blob, name: meta.filename || 'travel-document', type: blob.type || meta.filetype || 'application/octet-stream', size: blob.size, sha256: sum, uploaded: true, verifiedAt: new Date().toISOString() };
    await this.store.db.put('files', rec);
    return rec;
  }
}

// ---------- conflict resolution ----------
export async function resolveConflict(store, sync, conflict, choice, merged) {
  const { op, current } = conflict;
  let next = null;
  if (conflict.status === 'restore') { if (choice === 'mine') await store.commit(conflict.ops); await store.db.del('conflicts', conflict.opId); await store.refreshCounts(); return sync.run('resolve'); }
  if (choice === 'mine') {
    if (op.action === 'patch') next = { ...op, opId: crypto.randomUUID(), at: new Date().toISOString(), base: Object.fromEntries(Object.keys(op.set).map(f => [f, current?.[f] ?? null])), set: merged || op.set };
    else if (op.action === 'create' && current) next = { opId: crypto.randomUUID(), at: new Date().toISOString(), kind: op.kind, id: op.id, parent: op.parent, action: 'patch', set: merged || op.entity, base: Object.fromEntries(Object.keys(merged || op.entity).map(f => [f, current[f] ?? null])) };
    else if (op.action === 'create' && !current) next = { ...op, opId: crypto.randomUUID() };
    else if (op.action === 'delete') next = current ? { ...op, opId: crypto.randomUUID(), base: current } : null;
    else if (op.action === 'swap') next = { ...op, opId: crypto.randomUUID() };
    else if (op.action === 'patch' && current === null) next = null;
  }
  // Commit the decision first (entity + outbox), then clear the conflict. If interrupted between the
  // two, the conflict reappears and replaying the decision is idempotent by value.
  if (next) await store.commit(next);
  await store.db.del('conflicts', conflict.opId);
  await store.refreshCounts();
  return sync.run('resolve');
}

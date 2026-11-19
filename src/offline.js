// Download manager. Nothing is reported as downloaded until its bytes have been read back and checked.
import { sha256 } from './core/files.js';
import { mapLibs } from './ui/map.js';

export const PHOTO_CACHE = 'elsewhere-photos-v1';
const CHUNK = 2 * 1024 * 1024;

export async function storageInfo() {
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  return { usage: est.usage ?? null, quota: est.quota ?? null, persisted };
}
export async function requestPersist() { return navigator.storage?.persist ? navigator.storage.persist() : null; }

// ---------- map regions ----------
export async function remoteRegions(sync) { if (sync.localOnly) return []; return (await sync.request('/api/maps')).regions || []; }

async function verifyArchive(blob, expectedSha) {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (String.fromCharCode(...head.slice(0, 7)) !== 'PMTiles' || head[7] !== 3) throw new Error('This is not a PMTiles v3 map archive.');
  const sum = await sha256(blob);
  if (expectedSha && sum !== expectedSha) throw new Error('The map download failed its integrity check. Delete it and download again.');
  return sum;
}
async function readHeader(assetBase, blob) {
  const { pmtiles } = await mapLibs(assetBase);
  const p = new pmtiles.PMTiles({ getKey: () => 'probe', getBytes: async (o, l) => ({ data: await blob.slice(o, o + l).arrayBuffer() }) });
  const h = await p.getHeader();
  return { bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat], minzoom: h.minZoom, maxzoom: h.maxZoom };
}

// Resumable: completed chunks persist in IndexedDB; cancelling keeps them for the next attempt.
export async function downloadRegion(store, sync, region, { onProgress = () => {}, signal } = {}) {
  const existing = await store.db.get('maps', region.id);
  if (existing?.state === 'ready' && existing.sha256 === region.sha256) return existing;
  const est = await storageInfo();
  if (est.quota && est.usage != null && est.quota - est.usage < region.bytes * 1.3) throw new Error('Not enough free storage for this map (' + Math.round(region.bytes / 1048576) + ' MB plus working space). Remove other downloads or free space on this device.');
  await store.db.put('maps', { ...region, state: 'partial', blob: null, startedAt: existing?.startedAt || new Date().toISOString() });
  const total = Math.ceil(region.bytes / CHUNK);
  const have = new Set((await store.db.tx('mapChunks', 'readonly', s => s.mapChunks.keys())).filter(k => k[0] === region.id).map(k => k[1]));
  let received = [...have].reduce((n, i) => n + Math.min(CHUNK, region.bytes - i * CHUNK), 0);
  onProgress(received, region.bytes);
  for (let i = 0; i < total; i++) {
    if (have.has(i)) continue;
    if (signal?.aborted) throw Object.assign(new Error('Download paused. It will resume from ' + Math.round(received / region.bytes * 100) + '%.'), { paused: true });
    const start = i * CHUNK, end = Math.min(region.bytes, start + CHUNK) - 1;
    const res = await sync.request('/maps/' + region.id + '.pmtiles', { raw: true, headers: { Range: 'bytes=' + start + '-' + end }, signal });
    let blob = await res.blob();
    // A server that ignores Range sends the whole file: keep it, split into the same pieces.
    if (res.status === 200 && blob.size === region.bytes) {
      for (let j = i; j < total; j++) if (!have.has(j)) await store.db.put('mapChunks', { id: region.id, index: j, blob: blob.slice(j * CHUNK, Math.min(region.bytes, (j + 1) * CHUNK)) });
      received = region.bytes; onProgress(received, region.bytes); break;
    }
    if (blob.size !== end - start + 1) throw new Error('The map server returned an incomplete piece. Try again.');
    try { await store.db.put('mapChunks', { id: region.id, index: i, blob }); }
    catch (e) { if (e?.name === 'QuotaExceededError') throw new Error('This device ran out of storage while downloading the map. Downloaded pieces are kept; free space and resume.'); throw e; }
    received += blob.size; onProgress(received, region.bytes);
  }
  const chunks = (await store.db.tx('mapChunks', 'readonly', s => s.mapChunks.all())).filter(c => c.id === region.id).sort((a, b) => a.index - b.index);
  const blob = new Blob(chunks.map(c => c.blob), { type: 'application/vnd.pmtiles' });
  if (blob.size !== region.bytes) throw new Error('The map download is incomplete. Resume to finish it.');
  const sum = await verifyArchive(blob, region.sha256);
  const rec = { ...region, state: 'ready', blob, sha256: sum, verifiedAt: new Date().toISOString(), source: 'site' };
  await store.db.tx(['maps', 'mapChunks'], 'readwrite', async s => { await s.maps.put(rec); for (const c of chunks) await s.mapChunks.del([c.id, c.index]); });
  return rec;
}
export async function importRegionFile(store, assetBase, file, name) {
  const blob = new Blob([await file.arrayBuffer()], { type: 'application/vnd.pmtiles' });
  const sum = await verifyArchive(blob);
  const h = await readHeader(assetBase, blob);
  const id = (name || file.name).toLowerCase().replace(/\.pmtiles$/, '').replace(/[^a-z0-9-]+/g, '-').slice(0, 50) || 'region';
  const rec = { id, name: name || file.name.replace(/\.pmtiles$/i, ''), ...h, bytes: blob.size, sha256: sum, state: 'ready', blob, verifiedAt: new Date().toISOString(), source: 'file', attribution: '© OpenStreetMap contributors · Protomaps' };
  try { await store.db.put('maps', rec); } catch (e) { if (e?.name === 'QuotaExceededError') throw new Error('Not enough storage on this device for this map.'); throw e; }
  return rec;
}
export async function deleteRegion(store, id) {
  const keys = (await store.db.tx('mapChunks', 'readonly', s => s.mapChunks.keys())).filter(k => k[0] === id);
  await store.db.tx(['maps', 'mapChunks'], 'readwrite', async s => { await s.maps.del(id); for (const k of keys) await s.mapChunks.del(k); });
}
export async function recheckRegion(store, id) { const r = await store.db.get('maps', id); if (!r?.blob) throw new Error('Not downloaded'); const sum = await verifyArchive(r.blob, r.sha256); r.verifiedAt = new Date().toISOString(); r.sha256 = sum; await store.db.put('maps', r); return r; }

// ---------- photographs ----------
export async function cachePhotos(srcs, onProgress = () => {}) {
  const cache = await caches.open(PHOTO_CACHE); let done = 0, bytes = 0; const failed = [];
  for (const src of srcs) {
    let hit = await cache.match(src);
    if (!hit) { try { const r = await fetch(src, { credentials: 'same-origin' }); if (r.ok && (r.headers.get('Content-Type') || '').startsWith('image/')) { await cache.put(src, r.clone()); hit = r; } } catch {} }
    if (hit) { const b = await hit.clone().blob(); if (b.size > 500) bytes += b.size; else failed.push(src); } else failed.push(src);
    onProgress(++done, srcs.length);
  }
  return { bytes, failed };
}
export async function photoStatus(srcs) { if (!('caches' in self)) return { have: 0, total: srcs.length }; const c = await caches.open(PHOTO_CACHE); let have = 0; for (const s of srcs) if (await c.match(s)) have++; return { have, total: srcs.length }; }

// ---------- trip / collection packs ----------
export function regionsFor(points, regions) { return regions.filter(r => points.some(p => p.lon >= r.bounds[0] && p.lon <= r.bounds[2] && p.lat >= r.bounds[1] && p.lat <= r.bounds[3])); }
export async function verifyDocuments(store, sync, records, onProgress = () => {}) {
  const out = []; let i = 0;
  for (const r of records.filter(r => r.file)) {
    try { const f = await sync.downloadFile(r.file, r); const sum = await sha256(f.blob); if (f.sha256 && sum !== f.sha256) throw new Error('Integrity check failed'); out.push({ id: r.file, label: r.filename || r.title, bytes: f.size, ok: true }); }
    catch (e) { out.push({ id: r.file, label: r.filename || r.title, ok: false, error: e.message }); }
    onProgress(++i);
  }
  return out;
}

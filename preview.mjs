// Local preview with a mock R2 bucket. It is NOT production data.
// Options: --port N, --seed <runtime backup json> (loads a captured backup into the mock store),
//          --regions <dir> (serves .pmtiles + catalog from a folder), --persist <file> (keeps the mock store between runs).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import worker from './worker/index.js';

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const store = new Map(); let rev = 0;
const persistFile = arg('--persist');
const save = () => { if (!persistFile) return; fs.writeFileSync(persistFile, JSON.stringify([...store].map(([k, v]) => [k, { ...v, body: Buffer.from(v.body).toString('base64') }]))); };
if (persistFile && fs.existsSync(persistFile)) for (const [k, v] of JSON.parse(fs.readFileSync(persistFile, 'utf8'))) { store.set(k, { ...v, body: Buffer.from(v.body, 'base64') }); rev = Math.max(rev, +v.etag || 0); }
const toBuf = v => typeof v === 'string' ? Buffer.from(v) : v instanceof ArrayBuffer ? Buffer.from(v) : ArrayBuffer.isView(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : Buffer.from(String(v));
const obj = (k, o, body = o.body) => ({ key: k, size: o.body.length, etag: o.etag, httpEtag: o.httpEtag, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata, body, json: async () => JSON.parse(o.body.toString('utf8')), text: async () => o.body.toString('utf8'), arrayBuffer: async () => o.body.buffer.slice(o.body.byteOffset, o.body.byteOffset + o.body.length) });
export const BUCKET = {
  failNext: 0,
  async list({ prefix = '' } = {}) { return { objects: [...store.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
  async head(k) { const o = store.get(k); return o ? obj(k, o, null) : null; },
  async get(k, opts = {}) {
    const o = store.get(k); if (!o) return null;
    if (opts.range) { const start = opts.range.offset, end = opts.range.length ? start + opts.range.length : o.body.length; return obj(k, o, o.body.subarray(start, end)); }
    return obj(k, o);
  },
  async put(k, v, opts = {}) {
    if (BUCKET.failNext > 0) { BUCKET.failNext--; throw new Error('Simulated storage failure'); }
    const old = store.get(k);
    if (opts.onlyIf && ((opts.onlyIf.etagMatches && opts.onlyIf.etagMatches !== old?.etag) || (opts.onlyIf.etagDoesNotMatch === '*' && old))) return null;
    const etag = createHash('md5').update(String(++rev)).digest('hex'), httpEtag = '"' + etag + '"';
    store.set(k, { body: toBuf(v), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata, etag, httpEtag }); save();
    return { etag, httpEtag };
  },
  async delete(k) { store.delete(k); save(); },
};

const seed = arg('--seed');
if (seed && !store.size) {
  const b = JSON.parse(fs.readFileSync(seed, 'utf8'));
  for (const p of b.state.body) await BUCKET.put('atlas/' + p.id + '.json', JSON.stringify(p));
  await BUCKET.put('profile/travel-v1.json', JSON.stringify(b.profile.body));
  if (b.hub.body.records && Object.values(b.hub.body.records).some(a => a.length)) await BUCKET.put('workspace/hub-v1.json', JSON.stringify(b.hub.body));
  await BUCKET.put('collection/forty-v1.json', JSON.stringify(b.forty.body));
  console.log('Seeded mock store from', seed);
}
const regions = arg('--regions');
if (regions) {
  const catalog = [];
  for (const f of fs.readdirSync(regions).filter(f => f.endsWith('.pmtiles'))) {
    const bytes = fs.readFileSync(path.join(regions, f)), id = f.replace('.pmtiles', '');
    const meta = JSON.parse(fs.readFileSync(path.join(regions, id + '.json'), 'utf8'));
    store.set('maps/' + f, { body: bytes, httpMetadata: { contentType: 'application/vnd.pmtiles' }, etag: 'm' + id, httpEtag: '"m' + id + '"' });
    catalog.push({ ...meta, id, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  store.set('maps/catalog.json', { body: Buffer.from(JSON.stringify({ regions: catalog })), etag: 'cat', httpEtag: '"cat"' });
  console.log('Serving', catalog.length, 'map regions');
}

const env = { BUCKET };
let offlineServer = false, authExpired = false;
http.createServer(async (req, res) => {
  try {
    // QA controls for automated tests (preview only).
    if (req.url.startsWith('/_preview/')) {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/_preview/mobile') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Wanderlust 390px review</title><body style="margin:0;background:#243c33;display:flex;justify-content:center;padding:20px"><iframe title="Mobile layout" src="/" style="width:390px;height:844px;border:0;border-radius:14px"></iframe>'); return; }
      if (u.pathname === '/_preview/fail') { BUCKET.failNext = +u.searchParams.get('n') || 1; }
      if (u.pathname === '/_preview/server-down') offlineServer = u.searchParams.get('on') === '1';
      if (u.pathname === '/_preview/auth-expired') authExpired = u.searchParams.get('on') === '1';
      if (u.pathname === '/_preview/dump') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(Object.fromEntries([...store].filter(([k]) => !k.startsWith('maps/')).map(([k, v]) => [k, v.httpMetadata?.contentType?.includes('json') || k.endsWith('.json') ? JSON.parse(v.body.toString()) : { bytes: v.body.length, type: v.httpMetadata?.contentType, sha256: v.customMetadata?.sha256 }])))); return; }
      res.writeHead(204); res.end(); return;
    }
    if (authExpired && !req.url.startsWith('/app/')) { res.writeHead(302, { Location: 'https://auth.example.invalid/login' }); res.end(); return; }
    if (offlineServer && req.url.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"Simulated outage"}'); return; }
    const host = req.headers.host, url = 'http://' + host + req.url, parts = [];
    for await (const part of req) parts.push(part);
    const response = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, ...(parts.length ? { body: Buffer.concat(parts) } : {}) }), env);
    const headers = Object.fromEntries(response.headers);
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) { console.error(e); res.writeHead(500); res.end('Preview error'); }
}).listen(Number(arg('--port') || process.env.PORT || 4173), '127.0.0.1', () => console.log('Elsewhere preview on http://127.0.0.1:' + (arg('--port') || process.env.PORT || 4173)));

// Attachment bytes live in IndexedDB on this device, so photos and PDFs open without a connection.
export const ACCEPTED = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_FILE = 10_000_000;

export async function sha256(blob) {
  const buf = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sniff(blob) {
  const a = new Uint8Array(await blob.slice(0, 12).arrayBuffer()), s = String.fromCharCode(...a);
  // Compare bytes, not a literal marker: the desktop shell sniffs file contents to choose a MIME type.
  if ([37, 80, 68, 70, 45].every((b, i) => a[i] === b)) return 'application/pdf';
  if (a[0] === 255 && a[1] === 216) return 'image/jpeg';
  if (a[0] === 137 && s.slice(1, 4) === 'PNG') return 'image/png';
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// Store a chosen file locally first. It uploads with the next sync.
export async function addFile(store, file) {
  const max = globalThis.__elsewhere?.config?.maxUpload || MAX_FILE;
  if (file.size > max) throw new Error('Choose a file smaller than ' + Math.floor(max / 1e6 * 10) / 10 + ' MB.');
  const type = await sniff(file);
  if (!type) throw new Error('Use a PDF, JPG, PNG or WebP file. (iPhone HEIC photos: export as JPEG first.)');
  const id = 'file-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const blob = new Blob([await file.arrayBuffer()], { type });
  const rec = { id, blob, name: (file.name || 'travel-document').slice(0, 200), type, size: blob.size, sha256: await sha256(blob), uploaded: store.localOnly, createdAt: new Date().toISOString() };
  try { await store.db.put('files', rec); }
  catch (e) { if (e?.name === 'QuotaExceededError') throw new Error('This device is out of storage for Wanderlust. Free space or remove downloaded maps, then try again.'); throw e; }
  return rec;
}
export const fileFields = rec => ({ file: rec.id, filename: rec.name, filetype: rec.type, filesize: String(rec.size), sha256: rec.sha256 });

const urls = new Map();
export async function fileURL(store, sync, id, meta) {
  if (urls.has(id)) return urls.get(id);
  let rec = await store.db.get('files', id);
  if (!rec?.blob) rec = await sync.downloadFile(id, meta);
  const u = URL.createObjectURL(rec.blob); urls.set(id, u); return u;
}
export async function hasLocalFile(store, id) { return !!(await store.db.get('files', id))?.blob; }

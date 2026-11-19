// Portable full backup: every record, unsent edits and attachment bytes, with integrity hashes.
// Optional passphrase encryption uses AES-GCM with a PBKDF2-derived key (Web Crypto).
import { sha256 } from './files.js';
import { validateProfile, validateHub, validatePlace, normaliseHub, ensureProfileIds, clone } from './model.js';

const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const enc = new TextEncoder();

export async function buildBackup(store, { includeFiles = true, appVersion = '', includeVault = false } = {}) {
  const docs = store.toDocs();
  const outbox = (await store.db.all('outbox')).map(o => o.op);
  const files = [];
  if (includeFiles) for (const f of await store.db.all('files')) if (f.blob) files.push({ id: f.id, name: f.name, type: f.type, size: f.size, sha256: f.sha256, uploaded: !!f.uploaded, data: b64(await f.blob.arrayBuffer()) });
  const referenced = Object.values(docs.hub.records).flat().filter(r => r.file);
  const missing = referenced.filter(r => !files.some(f => f.id === r.file)).map(r => ({ id: r.file, filename: r.filename }));
  const data = { places: [...docs.places, ...docs.deletedPlaces.map(id => ({ id, deleted: true }))], profile: docs.profile, hub: docs.hub, forty: docs.forty, settings: docs.settings };
  const dataHash = await sha256(enc.encode(JSON.stringify(data)).buffer);
  let vault = [];
  if (includeVault) { const { listVault } = await import('./vault.js'); vault = await Promise.all((await listVault(store.db)).map(async ({ blob, ...i }) => ({ ...i, type: blob?.type || '', data: blob ? b64(await blob.arrayBuffer()) : '' }))); }
  return { format: 'elsewhere-backup', version: 2, vault, createdAt: new Date().toISOString(), appVersion, space: store.space, integrity: { data: dataHash, files: files.length, missingFiles: missing }, data, unsentChanges: outbox, files };
}

export async function encryptBackup(obj, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iterations = 310000;
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { format: 'elsewhere-backup-encrypted', version: 2, kdf: 'PBKDF2-SHA256', iterations, cipher: 'AES-256-GCM', salt: b64(salt), iv: b64(iv), ciphertext: b64(ct) };
}
export async function decryptBackup(obj, passphrase) {
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(obj.salt), iterations: obj.iterations, hash: 'SHA-256' }, await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, key, unb64(obj.ciphertext)))); }
  catch { throw new Error('That passphrase does not open this backup.'); }
}

// Validate everything before touching the device's data.
export async function verifyBackup(b) {
  if (b?.format !== 'elsewhere-backup' || b.version !== 2) throw new Error('This is not an Wanderlust full backup.');
  if (await sha256(enc.encode(JSON.stringify(b.data)).buffer) !== b.integrity?.data) throw new Error('The backup’s records failed their integrity check. It may be incomplete or edited.');
  const err = validateProfile(ensureProfileIds(clone(b.data.profile))) || validateHub(normaliseHub(b.data.hub)) || b.data.places.map(validatePlace).find(Boolean);
  if (err) throw new Error('The backup contains invalid data: ' + err);
  for (const f of b.files) { const bytes = unb64(f.data); if (bytes.length !== f.size || await sha256(bytes.buffer) !== f.sha256) throw new Error('Attachment “' + f.name + '” failed its integrity check.'); }
  return { places: b.data.places.filter(p => !p.deleted).length, countries: b.data.profile.countries.length, trips: b.data.profile.trips.length, records: Object.values(b.data.hub.records).flat().length, files: b.files.length, missingFiles: b.integrity.missingFiles?.length || 0, unsent: b.unsentChanges?.length || 0, createdAt: b.createdAt };
}

// Restore replaces this device's copy. Cloud data is not overwritten automatically: on the next
// sync, any difference is offered as a decision ("Upload backup" or "Keep cloud copy").
export async function restoreBackup(store, b) {
  await verifyBackup(b);
  await store.db.tx(['entities', 'outbox', 'conflicts', 'files', 'meta'], 'readwrite', async s => {
    await s.outbox.clear(); await s.conflicts.clear();
    for (const f of b.files) await s.files.put({ id: f.id, blob: new Blob([unb64(f.data)], { type: f.type }), name: f.name, type: f.type, size: f.size, sha256: f.sha256, uploaded: f.uploaded, verifiedAt: new Date().toISOString() });
    for (const op of b.unsentChanges || []) await s.outbox.add({ opId: op.opId, op, state: 'pending', attempts: 0, nextAttempt: 0, createdAt: op.at });
    await s.meta.put({ key: 'restoredFrom', value: { createdAt: b.createdAt, at: new Date().toISOString(), space: b.space } });
  });
  if (b.vault?.length) { const { saveVault } = await import('./vault.js'); for (const { data, type, ...i } of b.vault) await saveVault(store.db, i, data ? new Blob([unb64(data)], { type }) : null); }
  await store.replaceFrom(b.data, { seeded: true });
  await store.refreshCounts();
}

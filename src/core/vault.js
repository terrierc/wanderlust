// Documents wallet: passports, visas, insurance, vaccination records. Stored only on this device,
// encrypted with AES-GCM using a key that is generated here and cannot be exported from the browser.
// Never synced or sent anywhere. Limits: anyone using this unlocked device and browser profile can open
// Wanderlust and view them; the encryption protects the stored files, not an unlocked session.
export const DOC_KINDS = ['Passport', 'Visa', 'Travel insurance', 'Vaccination record', 'Booking confirmation', 'Driving licence', 'Other'];
async function key(db) {
  const k = (await db.get('meta', 'vaultKey'))?.value;
  if (k) return k;
  const nk = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await db.put('meta', { key: 'vaultKey', value: nk });
  return nk;
}
export async function seal(db, item, blob) {
  const k = await key(db), iv = crypto.getRandomValues(new Uint8Array(12));
  const meta = new TextEncoder().encode(JSON.stringify(item)), body = blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array(0);
  const plain = new Uint8Array(4 + meta.length + body.length); new DataView(plain.buffer).setUint32(0, meta.length); plain.set(meta, 4); plain.set(body, 4 + meta.length);
  return { id: item.id, iv, data: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, plain), expiry: item.expiry || '', type: blob?.type || '' };
}
export async function open(db, rec) {
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, await key(db), rec.data));
  const n = new DataView(plain.buffer).getUint32(0), item = JSON.parse(new TextDecoder().decode(plain.slice(4, 4 + n)));
  const body = plain.slice(4 + n);
  return { ...item, blob: body.length ? new Blob([body], { type: rec.type }) : null };
}
export async function listVault(db) { return Promise.all((await db.all('vault')).map(r => open(db, r))); }
export async function saveVault(db, item, blob) { await db.put('vault', await seal(db, item, blob)); }
export const expiringSoon = (items, days = 183, today = new Date()) => items.filter(i => i.expiry && (new Date(i.expiry) - today) / 864e5 <= days);
// Shrink photos before storing (journal): long edge at most 2000px, JPEG quality 0.82.
export async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400000) return file;
  const bmp = await createImageBitmap(file), s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const out = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  return out.size < file.size ? new File([out], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
}

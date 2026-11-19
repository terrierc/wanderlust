// Small promise wrapper around IndexedDB. One database per data space (account/Site bucket),
// plus a device database that only remembers which spaces exist on this device.
export const DB_VERSION = 2;
const MIGRATIONS = [
  // v1: initial local-first schema
  db => {
    db.createObjectStore('entities', { keyPath: 'k' }).createIndex('kind', 'kind');
    db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true }).createIndex('opId', 'opId', { unique: true });
    db.createObjectStore('conflicts', { keyPath: 'opId' });
    db.createObjectStore('files', { keyPath: 'id' });
    db.createObjectStore('maps', { keyPath: 'id' });
    db.createObjectStore('mapChunks', { keyPath: ['id', 'index'] });
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('packs', { keyPath: 'id' });
  },
  // v2: encrypted documents wallet (device only)
  db => { db.createObjectStore('vault', { keyPath: 'id' }); },
];

const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function openDatabase(name, migrations = MIGRATIONS) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, migrations.length);
    r.onupgradeneeded = e => { const db = r.result; for (let v = e.oldVersion; v < migrations.length; v++) migrations[v](db, r.transaction); };
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dispatchEvent(new CustomEvent('elsewhere:db-closed')); }; resolve(wrap(db)); };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Close other Wanderlust tabs to finish updating this device’s data.'));
  });
}

function wrap(db) {
  const api = {
    raw: db,
    name: db.name,
    // Run fn inside one transaction; resolves after the transaction commits (durability point).
    tx(stores, mode, fn) {
      return new Promise((resolve, reject) => {
        let result;
        const t = db.transaction(stores, mode, { durability: 'strict' });
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Transaction aborted'));
        const s = Object.fromEntries((Array.isArray(stores) ? stores : [stores]).map(n => [n, store(t.objectStore(n))]));
        Promise.resolve().then(() => fn(s, t)).then(v => { result = v; }, e => { try { t.abort(); } catch {} reject(e); });
      });
    },
    get: (s, k) => api.tx(s, 'readonly', x => x[s].get(k)),
    all: (s, q) => api.tx(s, 'readonly', x => x[s].all(q)),
    put: (s, v) => api.tx(s, 'readwrite', x => x[s].put(v)),
    del: (s, k) => api.tx(s, 'readwrite', x => x[s].del(k)),
    close: () => db.close(),
  };
  return api;
}
function store(os) {
  return {
    get: k => req(os.get(k)),
    all: q => req(os.getAll(q)),
    keys: q => req(os.getAllKeys(q)),
    put: v => req(os.put(v)),
    add: v => req(os.add(v)),
    del: k => req(os.delete(k)),
    clear: () => req(os.clear()),
    count: q => req(os.count(q)),
    index: n => { const i = os.index(n); return { get: k => req(i.get(k)), all: q => req(i.getAll(q)), keys: q => req(i.getAllKeys(q)) }; },
  };
}

export async function deleteDatabase(name) {
  return new Promise((res, rej) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('Close other Wanderlust tabs first.')); });
}

// Device registry: which data spaces are stored here, and which was used last.
const DEVICE_MIGRATIONS = [db => db.createObjectStore('device', { keyPath: 'key' })];
let deviceDb;
export async function device() { return (deviceDb ??= await openDatabase('elsewhere-device', DEVICE_MIGRATIONS)); }
export async function deviceGet(key) { return (await (await device()).get('device', key))?.value; }
export async function deviceSet(key, value) { return (await device()).put('device', { key, value }); }
export const spaceDbName = space => 'elsewhere-space-' + space.replace(/[^a-zA-Z0-9-]/g, '');

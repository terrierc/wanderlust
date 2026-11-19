import { esc, icon, field, formValues, toast, confirmDialog, promptDialog, fmtBytes, ago, ext, pill } from '../kit.js';
import { resolveConflict } from '../../core/sync.js';
import { buildBackup, encryptBackup, decryptBackup, verifyBackup, restoreBackup } from '../../core/backup.js';
import { download, placesCSV, workbookXML, planImport, calendarICS } from '../../core/exports.js';
import { fortyModel, prettyDate } from '../../core/domain.js';
import { storageInfo, requestPersist, remoteRegions, downloadRegion, importRegionFile, deleteRegion, recheckRegion, cachePhotos, photoStatus, regionsFor, verifyDocuments } from '../../offline.js';
import { deleteDatabase, deviceGet, deviceSet, spaceDbName } from '../../core/db.js';

const SECTIONS = [['wallet', 'Wallet: all bookings', 'file'], ['settle', 'Settle up: all trips', 'swap'], ['deals', 'Deals board: fares you watch', 'journeys'], ['documents', 'Documents (this device only)', 'lock'], ['sync', 'Sync & account', 'sync'], ['conflicts', 'Decisions waiting', 'alert'], ['offline', 'Offline & downloads', 'download'], ['backup', 'Backup & restore', 'lock'], ['import', 'Import & export', 'file'], ['settings', 'Settings', 'edit'], ['device', 'Data on this device', 'lock'], ['about', 'How offline works', 'cloud'], ['credits', 'Photo & map credits', 'camera']];
const page = (title, body, back = '/more') => ({ title, html: '<section class="page narrow more"><a class="back" href="' + back + '">' + icon('back') + ' More</a><h1>' + esc(title) + '</h1>' + body + '</section>' });
const OP_LABEL = o => ({ create: 'Added', patch: 'Edited', delete: 'Removed', swap: 'Swapped', restore: 'Restored' }[o.action] || o.action) + ' ' + ({ place: 'place', country: 'country', trip: 'journey', cost: 'cost', task: 'task', fortyEntry: 'forty notes', fortyExtra: 'optional place', fortySelection: 'forty selection', setting: 'setting' }[o.kind] || o.kind.replace(/s$/, ''));

export const index = {
  render(ctx) {
    const s = ctx.sync.status;
    return { title: 'More', screen: 'more', html: '<section class="page narrow more"><h1>More</h1><p class="lede">' + (ctx.config.mode === 'packaged' ? 'Packaged app · data stays on this device.' : 'Private site · ' + (s.pending ? s.pending + ' change(s) waiting to sync' : 'last synced ' + ago(s.lastPull))) + '</p><ul class="menu">' + SECTIONS.map(([k, l, i]) => '<li><a href="' + (k === 'wallet' ? '/wallet' : k === 'settle' ? '/settle' : k === 'deals' ? '/deals' : k === 'documents' ? '/documents' : '/more/' + k) + '">' + icon(i) + '<span>' + l + (k === 'conflicts' && s.conflicts ? ' ' + pill(String(s.conflicts), 'hold') : '') + '</span>' + icon('arrow') + '</a></li>').join('') + '</ul></section>' };
  },
};

export const section = {
  render(ctx) {
    const k = ctx.route.params.section, f = R[k];
    return f ? f(ctx) : page('Not found', '<p>That section does not exist.</p>');
  },
};

const R = {
  sync(ctx) {
    const s = ctx.sync.status, packaged = ctx.config.mode === 'packaged';
    const explain = { local: 'This packaged app keeps everything on this device. Move data with a full backup.', synced: 'Everything on this device matches your private site.', pending: 'Some changes are saved on this device and waiting to upload.', syncing: 'Syncing now…', offline: 'You are offline. Every change is saved on this device and will sync when you reconnect.', 'signed-out': 'Your sign-in to the private site has expired. Your changes are safe here; sign in to resume syncing.', error: 'The site did not accept the last attempt. Wanderlust will retry automatically.', conflict: 'Some changes need your decision.', idle: 'Ready.', account: s.error };
    return {
      title: 'Sync & account', html: '<section class="page narrow more"><a class="back" href="/more">' + icon('back') + ' More</a><h1>Sync &amp; account</h1><div class="panel"><p class="big-status s-' + esc(s.state) + '">' + esc(explain[s.state] || s.state) + '</p><dl class="glance"><div><dt>Waiting to upload</dt><dd>' + s.pending + ' change(s)</dd></div><div><dt>Decisions waiting</dt><dd>' + s.conflicts + '</dd></div><div><dt>Last synced</dt><dd>' + esc(ago(s.lastPull)) + '</dd></div><div><dt>Data space</dt><dd><code>' + esc(ctx.space) + '</code></dd></div>' + (ctx.person ? '<div><dt>Signed in as</dt><dd>' + (ctx.person === 'partner' ? 'Partner' : 'You') + '</dd></div>' : '') + '</dl>' + (s.error && s.state !== 'account' ? '<p class="muted small">' + esc(s.error) + '</p>' : '') +
        (!packaged ? '<div class="row"><button class="btn primary" data-act="syncNow">' + icon('sync') + ' Sync now</button>' + (s.state === 'signed-out' ? '<a class="btn" href="/?signin=1" data-hard>Sign in</a>' : '') + (ctx.config.host === 'netlify' ? '<a class="btn ghost" href="/__lock" data-hard>Lock the site on this device</a>' : '') + '</div>' : '') + '</div>' +
        '<h2>Unsent changes</h2><ul class="rows" id="pendingList"><li class="muted">Loading…</li></ul><p class="muted small">Changes are committed on this device first and sent in order. Each has an ID, so a retried upload is never applied twice. Sync runs when Wanderlust opens, when you reconnect, after edits and when you press Sync now; background sync, where the browser supports it, only triggers the same step.</p></section>',
      async mount(root) { const ob = (await ctx.store.db.all('outbox')).sort((a, b) => b.seq - a.seq).slice(0, 100); root.querySelector('#pendingList').innerHTML = ob.map(o => '<li class="row-item static"><span><strong>' + esc(OP_LABEL(o.op)) + '</strong><small>' + esc(ctx.store.get(o.op.kind, o.op.id)?.name || ctx.store.get(o.op.kind, o.op.id)?.title || o.op.id) + ' · ' + esc(ago(o.createdAt)) + '</small></span></li>').join('') || '<li class="muted">Nothing waiting.</li>'; },
    };
  },
  conflicts(ctx) {
    return {
      title: 'Decisions waiting', html: '<section class="page narrow more"><a class="back" href="/more">' + icon('back') + ' More</a><h1>Decisions waiting</h1><p class="lede">When the same thing was changed in two places, Wanderlust asks rather than guessing.</p><div id="conflictList"><p class="muted">Loading…</p></div></section>',
      async mount(root) {
        const list = await ctx.store.db.all('conflicts');
        ctx._conflicts = list;
        root.querySelector('#conflictList').innerHTML = list.map((c, i) => {
          if (c.status === 'restore') return '<article class="panel conflict"><h2>Restored backup</h2><p>' + esc(c.reason) + '</p><p class="muted small">Uploading adds and edits records in the cloud to match the backup. Records that only exist in the cloud are kept.</p><div class="row"><button class="btn primary" data-act="resolve" data-i="' + i + '" data-choice="mine">Upload backup changes</button><button class="btn" data-act="resolve" data-i="' + i + '" data-choice="theirs">Keep the cloud copy</button></div></article>';
          const name = c.current?.name || c.current?.title || c.op.entity?.name || c.op.entity?.title || c.op.id;
          const show = v => v === null || v === undefined || v === '' ? '— (blank)' : typeof v === 'object' ? (Array.isArray(v) ? v.map(x => x?.name || JSON.stringify(x)).join(', ') : JSON.stringify(v)) : String(v);
          const nice = f => ({ notes: 'Notes', nextAction: 'Next decision', status: 'Status', stops: 'Stops', name: 'Name', title: 'Title', total: 'Total', paid: 'Paid', startDate: 'Start date', budget: 'Budget', scope: 'Shape of the journey' })[f] || f.replace(/([A-Z])/g, ' $1').replace(/^./, x => x.toUpperCase());
          const rows = c.op.action === 'patch' ? Object.keys(c.op.set).map(f => '<tr><th scope="row">' + esc(nice(f)) + '</th><td>' + esc(show(c.op.set[f])) + '</td><td>' + esc(c.current ? show(c.current[f]) : '(removed)') + '</td></tr>').join('') : '';
          const reason = (c.reason || '').replace(/: ([a-zA-Z, ]+)$/, (m, f) => ': ' + f.split(', ').map(nice).join(', '));
          return '<article class="panel conflict"><h2>' + esc(OP_LABEL(c.op)) + ': ' + esc(name) + '</h2><p>' + esc(reason) + '</p>' + (rows ? '<div class="table-wrap"><table class="table"><thead><tr><th>Field</th><th>This device</th><th>Saved elsewhere</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') +
            (c.status === 'rejected' ? '<p class="muted">The site could not accept this change. Discarding keeps the saved version; you can then make the change again.</p><div class="row"><button class="btn" data-act="resolve" data-i="' + i + '" data-choice="theirs">Discard this change</button></div>'
              : '<div class="row"><button class="btn primary" data-act="resolve" data-i="' + i + '" data-choice="mine">' + (c.op.action === 'delete' ? 'Remove it anyway' : 'Use this device’s version') + '</button><button class="btn" data-act="resolve" data-i="' + i + '" data-choice="theirs">' + (c.op.action === 'delete' ? 'Keep it' : 'Keep the saved version') + '</button></div>') + '<p class="muted small">Changed ' + esc(ago(c.op.at)) + ' on this device.</p></article>';
        }).join('') || '<p class="muted">No decisions waiting.</p>';
      },
    };
  },
  offline(ctx) {
    const packaged = ctx.config.mode === 'packaged';
    return {
      title: 'Offline & downloads', html: '<section class="page narrow more"><a class="back" href="/more">' + icon('back') + ' More</a><h1>Offline &amp; downloads</h1>' +
        '<div class="panel"><h2>Storage on this device</h2><div id="storage">Checking…</div><p class="muted small">Browsers can clear website storage under pressure unless storage is marked persistent. Keep a full backup as well.</p><button class="btn" data-act="persist">Ask to keep data persistent</button></div>' +
        '<div class="panel"><h2>Prepare journeys</h2><p class="muted">Download a journey’s documents, photos and maps, then check they open without a connection.</p><ul class="rows">' + ctx.store.list('trip').map(t => '<li><a class="row-item" href="/prepare/trip:' + esc(t.id) + '"><span><strong>' + esc(t.name) + '</strong><small id="pack-' + esc(t.id) + '"></small></span>' + icon('arrow') + '</a></li>').join('') + '<li><a class="row-item" href="/prepare/forty"><span><strong>The forty</strong><small id="pack-forty"></small></span>' + icon('arrow') + '</a></li></ul></div>' +
        '<div class="panel"><h2>Detailed maps</h2><p class="muted">The world overview is built in. Detailed regions are OpenStreetMap data (© OpenStreetMap contributors, via Protomaps) stored on this device. They show streets and paths for reference; they are not turn-by-turn directions.</p><div id="regions">Checking…</div>' +
        '<form class="row wrap" data-form="regionImport"><div class="field grow"><label for="ri">Add a region from a .pmtiles file</label><input id="ri" name="file" type="file" accept=".pmtiles" required></div><button class="btn">Add map file</button></form>' + (packaged || ctx.config.host === 'netlify' ? '' : '<details class="more-filters"><summary>Upload a region to your private site</summary><p class="muted small">Makes a region available to every device signed in to your site. Create regions with <code>node scripts/make-region.mjs</code>. Up to 95 MB each.</p><form class="row wrap" data-form="regionUpload"><div class="field grow"><label for="ru">Region file (.pmtiles)</label><input id="ru" name="file" type="file" accept=".pmtiles" required></div><div class="field grow"><label for="rn">Name</label><input id="rn" name="name" required maxlength="120" placeholder="e.g. Lofoten Islands, Norway"></div><button class="btn">Upload</button></form><p id="uploadOut" role="status"></p></details>') + '</div>' +
        '<div class="panel"><h2>Catalogue photographs</h2><p id="photos">Checking…</p><button class="btn" data-act="cacheAllPhotos">Download all photographs</button></div></section>',
      async mount(root) {
        const s = await storageInfo();
        root.querySelector('#storage').innerHTML = '<dl class="glance"><div><dt>Used by Wanderlust (approx.)</dt><dd>' + fmtBytes(s.usage) + '</dd></div><div><dt>Available to this site</dt><dd>' + fmtBytes(s.quota) + '</dd></div><div><dt>Persistent storage</dt><dd>' + (s.persisted === null ? 'Not supported here' : s.persisted ? 'Granted' : 'Not granted') + '</dd></div></dl>';
        for (const p of await ctx.store.db.all('packs')) { const el = root.querySelector('#pack-' + CSS.escape(p.id.replace('trip:', ''))); if (el) el.textContent = (p.complete ? 'Ready offline' : 'Partly prepared') + ' · checked ' + ago(p.verifiedAt); }
        await renderRegions(ctx, root);
        const srcs = Object.values(ctx.PHOTOS).map(p => p.src), st = await photoStatus(srcs), total = Object.values(ctx.PHOTOS).reduce((n, p) => n + (p.bytes || 0), 0);
        root.querySelector('#photos').textContent = st.have + ' of ' + st.total + ' photographs stored on this device (all: about ' + fmtBytes(total) + ').';
      },
    };
  },
  backup(ctx) {
    return page('Backup & restore', '<div class="panel"><h2>Full backup</h2><p>One file with every place, journey, record, setting and unsent change, plus the bytes of every attachment stored on this device, with integrity checks.</p><form data-form="makeBackup" class="grid-form">' + field(['encrypt', 'Protect with a passphrase (AES-256 encryption)', 'checkbox'], false) + '<div class="wide row end"><button class="btn primary">' + icon('download') + ' Create backup</button></div></form><p class="muted small">Attachments that have never been downloaded to this device are listed as missing in the backup. Prepare journeys for offline first for a complete copy. A forgotten passphrase cannot be recovered.</p></div>' +
      '<div class="panel"><h2>Restore</h2><p>Restoring replaces this device’s copy after checking the file. The cloud is not overwritten: on the next sync you decide whether to upload the backup’s differences.</p><form data-form="restoreBackup" class="row wrap"><div class="field grow"><label for="rb">Backup file (.elsewhere.json)</label><input id="rb" name="file" type="file" accept=".json,application/json" required></div><button class="btn">Check and restore</button></form></div>');
  },
  import(ctx) {
    return page('Import & export', '<div class="panel"><h2>Import an earlier export</h2><p>Accepts every earlier Wanderlust format: places JSON, travel profile JSON, complete planning backup, planning desk backup, 40-before-40 export, single journey or destination files and the catalogue spreadsheet (CSV). You review the changes before anything is saved.</p><form data-form="importFile" class="row wrap"><div class="field grow"><label for="if">File</label><input id="if" name="file" type="file" accept=".json,.csv" required></div><button class="btn">Review import</button></form><div id="importPlan"></div></div>' +
      '<div class="panel"><h2>Export</h2><div class="row wrap"><button class="btn" data-act="exportWorkbook">Spreadsheet workbook (Excel XML)</button><button class="btn" data-act="exportCSV">Catalogue (CSV)</button><button class="btn" data-act="exportPlaces">Places (JSON)</button><button class="btn" data-act="exportCalendar">All deadlines (.ics)</button></div><p class="muted small">Exports are snapshots. Use a full backup to restore.</p></div>');
  },
  settings(ctx) {
    return page('Settings', '<form class="panel grid-form" data-form="settingsSave"><h2 class="wide">Your forty</h2>' + field(['fortyDeadline', 'Target date for the forty (optional)', 'date'], ctx.store.setting('fortyDeadline'), { hint: 'Wanderlust never assumes a birthday or deadline. Leave blank to keep it open.' }) +
      '<h2 class="wide">Reminders on this device</h2><p class="wide muted small">A notification the day before and on the day of each key date. On iPhone this needs Wanderlust added to the Home Screen (iOS 16.4 or later). Needs a connection to turn on.</p><div class="wide row"><button type="button" class="btn" data-act="pushOn">Turn on notifications</button><button type="button" class="btn ghost" data-act="pushOff">Turn off</button></div>' + '<h2 class="wide">Money</h2>' + field(['defaultCurrency', 'Usual currency for new budgets', 'select', ['AUD', 'USD', 'EUR', 'GBP', 'NZD']], ctx.store.setting('defaultCurrency', 'AUD')) + '<div class="wide row end"><button class="btn primary">Save settings</button></div></form>');
  },
  device(ctx) {
    return {
      title: 'Data on this device', html: '<section class="page narrow more"><a class="back" href="/more">' + icon('back') + ' More</a><h1>Data on this device</h1>' +
        '<div class="panel"><h2>Privacy on this device</h2><p>Your private site’s sign-in protects the cloud copy. The copy on this device is protected by this device and browser profile: anyone who can open this browser profile can open Wanderlust offline. Wanderlust does not add a PIN, because a PIN in a web page would not encrypt the stored data. Use your device’s screen lock, and remove Wanderlust’s data from shared or lost devices.</p><p class="muted small">Losing access to the site does not delete copies already on devices. Clearing below removes this device’s copy only.</p></div>' +
        '<div class="panel"><h2>This account’s data</h2><p>Data space <code>' + esc(ctx.space) + '</code>.</p><div id="dev"></div><div class="row wrap"><button class="btn" data-act="exportThenClear">Back up, then remove from this device</button><button class="btn ghost danger" data-act="clearDevice">Remove without backup…</button></div></div>' +
        '<div class="panel"><h2>Other accounts on this device</h2><ul class="rows" id="otherSpaces"></ul></div></section>',
      async mount(root) {
        const [ob, files, maps] = await Promise.all([ctx.store.db.all('outbox'), ctx.store.db.all('files'), ctx.store.db.all('maps')]);
        root.querySelector('#dev').innerHTML = '<dl class="glance"><div><dt>Unsent changes</dt><dd>' + ob.length + '</dd></div><div><dt>Files</dt><dd>' + files.length + ' · ' + fmtBytes(files.reduce((n, f) => n + (f.size || 0), 0)) + '</dd></div><div><dt>Map regions</dt><dd>' + maps.length + ' · ' + fmtBytes(maps.reduce((n, m) => n + (m.blob ? m.bytes : 0), 0)) + '</dd></div></dl>';
        const others = ((await deviceGet('spaces')) || []).filter(s => s !== ctx.space);
        root.querySelector('#otherSpaces').innerHTML = others.map(s => '<li class="row-item static"><span><strong><code>' + esc(s) + '</code></strong><small>Kept separately. Not shown to this account.</small></span><button class="btn small ghost danger" data-act="removeSpace" data-space="' + esc(s) + '">Remove</button></li>').join('') || '<li class="muted">None.</li>';
      },
    };
  },
  about(ctx) {
    return page('How offline works', '<div class="panel prose"><h2>Three ways to use Wanderlust</h2><ol><li><strong>Private website with sync.</strong> Sign in to your Site. Edits save on this device first, then sync.</li><li><strong>Installed web app.</strong> Open the site once while online and install it (Add to Home Screen / Install app). After that first visit it opens without a connection: your atlas, journeys, files you prepared and maps you downloaded. A website that has never been opened on a device cannot download itself without a network.</li><li><strong>Packaged desktop app.</strong> Ships with the app, catalogue and world map inside, so it starts with no connection even the first time. It keeps its data on that computer; move data between it and the site with a full backup.</li></ol>' +
      '<h2>What needs a connection</h2><p>Live websites, current prices, availability, travel advice, booking sites, research in ChatGPT and syncing. Saved research keeps its source and checked date and is flagged when it is due for review. Detailed maps only cover regions you have downloaded.</p><h2>Notifications</h2><p>Wanderlust lists deadlines when open and exports them to your calendar, which can alert you. It does not schedule device notifications.</p><h2>Storage</h2><p>Device storage is reliable but not infallible: browsers may clear it, and devices are lost. Keep a full backup.</p></div>');
  },
  credits(ctx) {
    return page('Photo & map credits', '<div class="panel"><p class="muted">Photographs from Wikimedia Commons and Unsplash, resized and cropped. Each keeps its licence. Some forty entries use regional imagery, labelled as such.</p><ul class="credits">' + Object.values(ctx.PHOTOS).map(p => '<li><strong>' + esc(p.title) + '</strong><br>' + esc(p.credit) + ' · ' + esc(p.license) + ' ' + ext(p.page, 'Source') + '</li>').join('') + '</ul><h2>Maps and type</h2><p>World overview: Natural Earth (public domain). Detailed regions: © OpenStreetMap contributors (ODbL), tiles by Protomaps. Map rendering: MapLibre GL JS (BSD). Fonts: Fraunces and Inter (SIL Open Font License); map labels: Noto Sans (SIL OFL).</p></div>');
  },
};

async function renderRegions(ctx, root) {
  const el = root.querySelector('#regions'); if (!el) return;
  const local = await ctx.store.db.all('maps');
  let remote = []; try { remote = await remoteRegions(ctx.sync); } catch { remote = null; }
  const rows = local.map(r => '<li class="region"><div><strong>' + esc(r.name) + '</strong><small>' + (r.state === 'ready' ? 'On this device · ' + fmtBytes(r.bytes) + ' · zoom ' + r.minzoom + '–' + r.maxzoom + ' · checked ' + esc(ago(r.verifiedAt)) : 'Partly downloaded · resume below') + '</small><small>Bounds ' + r.bounds.map(n => (+n).toFixed(2)).join(', ') + '</small></div><div class="row">' + (r.state === 'ready' ? '<button class="btn small ghost" data-act="regionCheck" data-id="' + esc(r.id) + '">Check</button>' : '') + '<button class="btn small ghost danger" data-act="regionDelete" data-id="' + esc(r.id) + '">Delete</button></div></li>');
  const avail = (remote || []).filter(r => !local.some(l => l.id === r.id && l.state === 'ready' && l.sha256 === r.sha256)).map(r => '<li class="region"><div><strong>' + esc(r.name) + '</strong><small>' + fmtBytes(r.bytes) + ' · zoom to ' + r.maxzoom + (local.some(l => l.id === r.id && l.sha256 !== r.sha256 && l.state === 'ready') ? ' · update available' : '') + '</small><progress id="prog-' + esc(r.id) + '" max="1" value="0" hidden></progress></div><div class="row"><button class="btn small" data-act="regionDownload" data-id="' + esc(r.id) + '">' + (local.some(l => l.id === r.id && l.state === 'partial') ? 'Resume' : 'Download') + '</button><button class="btn small ghost" data-act="regionCancel" data-id="' + esc(r.id) + '" hidden>Pause</button></div></li>');
  ctx._remoteRegions = remote || [];
  el.innerHTML = '<ul class="regions">' + rows.join('') + avail.join('') + '</ul>' + (!rows.length && !avail.length ? '<p class="muted">' + (remote === null ? 'Connect to see the regions on your site.' : 'No regions yet.') + '</p>' : '');
}

// ---------- prepare a journey / the forty ----------
export const prepare = {
  render(ctx) {
    const scope = ctx.route.params.scope, isTrip = scope.startsWith('trip:'), t = isTrip && ctx.store.get('trip', scope.slice(5));
    if (isTrip && !t) return page('Not found', '<p>Journey not found.</p>');
    const f = fortyModel(ctx.store, ctx.FORTY);
    const places = isTrip ? (t.stops || []).map(s => ctx.store.get('place', s.id)).filter(Boolean) : f.entries.map(e => f.place(e)).filter(Boolean);
    const photoIds = [...new Set(isTrip ? [t.theme, ...places.map(p => p.id)] : f.entries.map(e => e.photoId))].filter(id => ctx.PHOTOS[id]);
    const docs = isTrip ? ['bookings', 'journal'].flatMap(k => ctx.store.records(k, t.id)).filter(r => r.file) : [];
    const recCount = isTrip ? ['days', 'legs', 'bookings', 'research', 'contacts', 'phrases', 'journal', 'reminders', 'preferences', 'votes', 'requests'].reduce((n, k) => n + ctx.store.records(k, t.id).length, 0) + ctx.store.list('cost', t.id).length + ctx.store.list('task', t.id).length : 48;
    ctx._prep = { scope, places, photoIds, docs };
    const photoBytes = photoIds.reduce((n, id) => n + (ctx.PHOTOS[id].bytes || 0), 0), docBytes = docs.reduce((n, r) => n + (+r.filesize || 0), 0);
    return {
      title: 'Prepare for offline', html: '<section class="page narrow more"><a class="back" href="' + (isTrip ? '/journeys/' + esc(t.id) : '/forty') + '">' + icon('back') + ' ' + esc(isTrip ? t.name : 'The forty') + '</a><h1>Prepare for offline</h1><p class="lede">' + esc(isTrip ? t.name : 'Your forty') + '. Choose what to keep on this device. Each item is checked after download.</p>' +
        '<form data-form="prepareRun" class="panel"><ul class="prep">' +
        '<li><label class="check"><input type="checkbox" checked disabled> <span><strong>Plans and records</strong> · ' + recCount + ' records · already on this device</span></label></li>' +
        (isTrip ? '<li><label class="check"><input type="checkbox" name="docs" checked' + (docs.length ? '' : ' disabled') + '> <span><strong>Documents and photos you attached</strong> · ' + docs.length + ' file(s)' + (docBytes ? ' · about ' + fmtBytes(docBytes) : '') + '</span></label></li>' : '') +
        '<li><label class="check"><input type="checkbox" name="photos" checked> <span><strong>Destination photographs</strong> · ' + photoIds.length + ' · about ' + fmtBytes(photoBytes) + '</span></label></li>' +
        '<li><span><strong>World overview map</strong> · built in</span></li><li id="prepMaps"><span class="muted">Checking detailed maps…</span></li></ul>' +
        '<div class="row end"><button class="btn primary">' + icon('download') + ' Prepare now</button></div><div id="prepOut" role="status" aria-live="polite"></div></form>' +
        '<p class="muted small">Wanderlust reports an item as ready only after reading its bytes back on this device. Live prices, availability and websites still need a connection.</p></section>',
      async mount(root) {
        const local = await ctx.store.db.all('maps'); let remote = []; try { remote = await remoteRegions(ctx.sync); } catch {}
        const cover = regionsFor(places, [...local.filter(r => r.state === 'ready'), ...remote.filter(r => !local.some(l => l.id === r.id && l.state === 'ready'))]);
        ctx._prep.regions = cover;
        root.querySelector('#prepMaps').innerHTML = cover.length ? cover.map(r => '<label class="check"><input type="checkbox" name="map-' + esc(r.id) + '" ' + (r.blob ? 'checked disabled' : 'checked') + '> <span><strong>Detailed map: ' + esc(r.name) + '</strong> · ' + fmtBytes(r.bytes) + (r.blob ? ' · on this device' : '') + '</span></label>').join('') : '<span><strong>Detailed maps</strong> · none available covering these places. The world overview still shows every pin. <a href="/more/offline">Add a region</a>.</span>';
        const pack = await ctx.store.db.get('packs', scope); if (pack) root.querySelector('#prepOut').innerHTML = packHTML(pack);
      },
    };
  },
};
const packHTML = p => '<h2>' + (p.complete ? 'Ready offline' : 'Partly prepared') + '</h2><p class="muted small">Checked ' + esc(new Date(p.verifiedAt).toLocaleString('en-AU')) + '</p><ul class="plain">' + p.items.map(i => '<li>' + (i.ok ? icon('check') : icon('alert')) + ' ' + esc(i.label) + (i.bytes ? ' · ' + fmtBytes(i.bytes) : '') + (i.error ? ' — ' + esc(i.error) : '') + '</li>').join('') + '</ul>';

const aborts = new Map();
export const actions = {
  async pushOn(el, ctx) {
    if (!('PushManager' in window) || !ctx.swReg) throw new Error('This browser cannot receive notifications from Wanderlust. On iPhone, add Wanderlust to the Home Screen first.');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications were not allowed. You can change this in the browser’s site settings.');
    const { key } = await ctx.sync.request('/api/push/key'), raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)), c => c.charCodeAt(0));
    const sub = await ctx.swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    const r = await ctx.sync.request('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) }); toast('Notifications on (' + r.devices + ' device' + (r.devices === 1 ? '' : 's') + ')');
  },
  async pushOff(el, ctx) { const sub = await ctx.swReg?.pushManager.getSubscription(); if (sub) { await ctx.sync.request('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) }).catch(() => {}); await sub.unsubscribe(); } toast('Notifications off on this device'); },
  async syncNow(el, ctx) { await ctx.sync.run('manual'); ctx.rerender(); toast(ctx.sync.status.state === 'synced' ? 'Synced' : 'Sync: ' + ctx.sync.status.state); },
  async resolve(el, ctx) { const c = ctx._conflicts[+el.dataset.i]; await resolveConflict(ctx.store, ctx.sync, c, el.dataset.choice); toast('Decision saved'); ctx.rerender(); },
  async persist(el, ctx) { const r = await requestPersist(); toast(r === null ? 'This browser does not support persistent storage.' : r ? 'Storage marked persistent.' : 'The browser declined. Installing the app or using it often can help; keep a backup.'); ctx.rerender(); },
  async cacheAllPhotos(el, ctx) { el.disabled = true; const r = await cachePhotos(Object.values(ctx.PHOTOS).map(p => p.src), (d, n) => { el.textContent = 'Downloading ' + d + ' / ' + n; }); toast(r.failed.length ? r.failed.length + ' photographs could not be stored (offline?).' : 'All photographs are on this device.'); ctx.rerender(); },
  async regionDownload(el, ctx) {
    const r = ctx._remoteRegions.find(x => x.id === el.dataset.id), prog = document.getElementById('prog-' + r.id), cancel = el.parentElement.querySelector('[data-act="regionCancel"]');
    const ac = new AbortController(); aborts.set(r.id, ac); el.disabled = true; prog.hidden = false; cancel.hidden = false; ctx.holdRender = (ctx.holdRender || 0) + 1;
    try { await downloadRegion(ctx.store, ctx.sync, r, { signal: ac.signal, onProgress: (a, b) => { prog.value = a / b; prog.textContent = Math.round(a / b * 100) + '%'; el.textContent = Math.round(a / b * 100) + '%'; } }); toast(r.name + ' downloaded and checked'); }
    catch (e) { toast(e.paused || e.name === 'AbortError' ? 'Paused. Resume any time; finished pieces are kept.' : e.message, { tone: 'error' }); }
    finally { aborts.delete(r.id); ctx.holdRender--; ctx.rerender(); }
  },
  regionCancel(el) { aborts.get(el.dataset.id)?.abort(); },
  async regionDelete(el, ctx) { if (!await confirmDialog('Delete this map from this device?', { ok: 'Delete', danger: true })) return; await deleteRegion(ctx.store, el.dataset.id); ctx.rerender(); },
  async regionCheck(el, ctx) { try { await recheckRegion(ctx.store, el.dataset.id); toast('Map checked: intact'); } catch (e) { toast(e.message, { tone: 'error' }); } ctx.rerender(); },
  exportWorkbook(el, ctx) { download('Wanderlust-Workbook.xml', workbookXML(ctx.store, ctx.FORTY, fortyModel), 'application/xml'); },
  exportCSV(el, ctx) { download('Wanderlust-Catalogue.csv', placesCSV(ctx.store.list('place')), 'text/csv;charset=utf-8'); },
  exportPlaces(el, ctx) { download('Wanderlust-Atlas.json', JSON.stringify(ctx.store.list('place'), null, 2), 'application/json'); },
  exportCalendar(el, ctx) { const c = calendarICS(ctx.store); download('Wanderlust-deadlines.ics', c.body, 'text/calendar'); toast(c.count + ' deadlines exported'); },
  async confirmImport(el, ctx) { const plan = ctx._import; if (!plan) return; await ctx.store.commit(plan.ops); ctx._import = null; toast(plan.ops.length + ' change(s) imported'); ctx.nav('/more'); },
  async exportThenClear(el, ctx) { await forms.makeBackup({ encrypt: { checked: false }, elements: [] }, ctx, null, true); await actions.clearDevice(el, ctx, null, true); },
  async clearDevice(el, ctx, e, backedUp = false) {
    const pending = ctx.store.pending;
    if (!await confirmDialog('Remove Wanderlust’s data from this device?', { ok: 'Remove from this device', danger: true, detail: (pending ? pending + ' change(s) have not synced and will be lost. ' : '') + (backedUp ? 'Your backup file has been downloaded. ' : 'No backup has been made. ') + 'Your private site’s copy is not affected.' })) return;
    ctx.store.db.close(); await deleteDatabase(spaceDbName(ctx.space));
    await deviceSet('spaces', ((await deviceGet('spaces')) || []).filter(s => s !== ctx.space)); await deviceSet('lastSpace', null);
    if ('caches' in self) await caches.delete('elsewhere-photos-v1');
    location.href = '/';
  },
  async removeSpace(el) { if (!await confirmDialog('Remove the other account’s copy from this device?', { ok: 'Remove', danger: true, detail: 'Any unsynced changes in it are lost.' })) return; await deleteDatabase(spaceDbName(el.dataset.space)); await deviceSet('spaces', ((await deviceGet('spaces')) || []).filter(s => s !== el.dataset.space)); location.reload(); },
};

export const forms = {
  async makeBackup(f, ctx, e, silent) {
    let b = await buildBackup(ctx.store, { appVersion: ctx.config.build, includeVault: !!f.encrypt?.checked });
    let name = 'Wanderlust-backup-' + new Date().toISOString().slice(0, 10);
    if (f.encrypt?.checked) { const pass = await promptDialog('Choose a passphrase', { label: 'Passphrase (at least 10 characters)', type: 'password', ok: 'Encrypt backup', detail: 'You will need it to restore. It cannot be recovered.' }); if (!pass) return; if (pass.length < 10) throw new Error('Use at least 10 characters.'); b = await encryptBackup(b, pass); name += '-encrypted'; }
    await download(name + '.elsewhere.json', JSON.stringify(b), 'application/json');
    if (!silent) toast('Backup created' + (b.integrity?.missingFiles?.length ? ' · ' + b.integrity.missingFiles.length + ' attachment(s) were not on this device' : ''));
  },
  async restoreBackup(f, ctx) {
    let b = JSON.parse(await f.file.files[0].text());
    if (b.format === 'elsewhere-backup-encrypted') { const pass = await promptDialog('This backup is encrypted', { label: 'Passphrase', type: 'password', ok: 'Unlock' }); if (!pass) return; b = await decryptBackup(b, pass); }
    const s = await verifyBackup(b);
    if (!await confirmDialog('Restore this backup to this device?', { ok: 'Restore', detail: 'Created ' + new Date(s.createdAt).toLocaleString('en-AU') + ': ' + s.places + ' places, ' + s.countries + ' countries, ' + s.trips + ' journeys, ' + s.records + ' planning records, ' + s.files + ' files' + (s.missingFiles ? ' (' + s.missingFiles + ' missing)' : '') + (s.unsent ? ', ' + s.unsent + ' unsent changes' : '') + '. This replaces the copy on this device. ' + (ctx.store.pending ? 'This device has ' + ctx.store.pending + ' unsent change(s) that will be replaced. ' : '') })) return;
    await restoreBackup(ctx.store, b); toast('Backup restored on this device'); ctx.nav('/');
  },
  async importFile(f, ctx) {
    const file = f.file.files[0]; if (file.size > 5_000_000) throw new Error('That file is larger than 5 MB.');
    const text = await file.text(), input = file.name.toLowerCase().endsWith('.csv') ? text : JSON.parse(text);
    const plan = planImport(ctx.store, input, file.name); ctx._import = plan;
    const counts = {}; for (const o of plan.ops) { const k = OP_LABEL(o); counts[k] = (counts[k] || 0) + 1; }
    document.getElementById('importPlan').innerHTML = '<div class="panel inset"><h3>' + esc(file.name) + '</h3><p>' + plan.notes.map(esc).join(' ') + '</p>' + (plan.ops.length ? '<ul class="plain">' + Object.entries(counts).map(([k, n]) => '<li>' + esc(k) + ': ' + n + '</li>').join('') + '</ul><div class="row"><button class="btn primary" data-act="confirmImport">Import ' + plan.ops.length + ' change(s)</button></div>' : '<p>Nothing to change: this device already matches the file.</p>') + '</div>';
  },
  async regionUpload(f, ctx) {
    const file = f.file.files[0], name = formValues(f).name, out = document.getElementById('uploadOut');
    out.textContent = 'Checking the file…';
    const r = await importRegionFile(ctx.store, ctx.A, file, name); // validates, reads bounds and zooms, and keeps a copy here
    out.textContent = 'Uploading ' + fmtBytes(r.bytes) + '…';
    const res = await ctx.sync.request('/maps/' + r.id + '.pmtiles', { method: 'PUT', body: r.blob, headers: { 'Content-Type': 'application/vnd.pmtiles', 'X-Region': encodeURIComponent(JSON.stringify({ name: r.name, bounds: r.bounds, minzoom: r.minzoom, maxzoom: r.maxzoom, sha256: r.sha256, built: new Date().toISOString().slice(0, 10) })) } });
    out.textContent = 'Uploaded and verified by the site (' + res.sha256.slice(0, 12) + '…).'; toast(r.name + ' is now available to your devices');
  },
  async regionImport(f, ctx) { const r = await importRegionFile(ctx.store, ctx.A, f.file.files[0]); toast(r.name + ' added and checked (' + fmtBytes(r.bytes) + ')'); ctx.rerender(); },
  async settingsSave(f, ctx) { const v = formValues(f); for (const [k, val] of Object.entries(v)) if (ctx.store.setting(k, null) !== (val || null)) await ctx.store.setSetting(k, val || null); toast('Settings saved'); },
  async prepareRun(f, ctx) {
    f.dataset.dirty = '1'; // hold background re-renders until preparation finishes
    const { scope, photoIds, docs, regions = [] } = ctx._prep, out = document.getElementById('prepOut'), items = [{ label: 'Plans and records on this device', ok: true }];
    out.innerHTML = '<p>Preparing…</p>';
    if (f.docs?.checked && docs.length) { out.innerHTML = '<p>Checking documents…</p>'; for (const d of await verifyDocuments(ctx.store, ctx.sync, docs)) items.push({ label: 'File: ' + d.label, ok: d.ok, bytes: d.bytes, error: d.error }); }
    if (f.photos.checked) { const r = await cachePhotos(photoIds.map(id => ctx.PHOTOS[id].src), (d, n) => { out.innerHTML = '<p>Photographs ' + d + ' / ' + n + '…</p>'; }); items.push({ label: 'Photographs: ' + (photoIds.length - r.failed.length) + ' of ' + photoIds.length, ok: !r.failed.length, bytes: r.bytes, error: r.failed.length ? 'Some could not be stored' : '' }); }
    for (const r of regions) {
      const box = f.elements['map-' + r.id]; if (!box?.checked) continue;
      if (r.blob) { items.push({ label: 'Map: ' + r.name, ok: true, bytes: r.bytes }); continue; }
      try { await downloadRegion(ctx.store, ctx.sync, r, { onProgress: (a, b) => { out.innerHTML = '<p>Map ' + esc(r.name) + ': ' + Math.round(a / b * 100) + '%</p>'; } }); items.push({ label: 'Map: ' + r.name, ok: true, bytes: r.bytes }); }
      catch (e) { items.push({ label: 'Map: ' + r.name, ok: false, error: e.message }); }
    }
    const pack = { id: scope, items, complete: items.every(i => i.ok), verifiedAt: new Date().toISOString() };
    await ctx.store.db.put('packs', pack); out.innerHTML = packHTML(pack); toast(pack.complete ? 'Ready offline' : 'Partly prepared: see the list');
  },
};

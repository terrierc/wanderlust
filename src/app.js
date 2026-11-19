// Wanderlust application shell: data space selection, local store, sync, routing and screens.
import { openDatabase, deviceGet, deviceSet, spaceDbName } from './core/db.js';
import { Store } from './core/store.js';
import { Sync } from './core/sync.js';
import { esc, icon, toast, ago } from './ui/kit.js';
import * as explore from './ui/screens/explore.js';
import * as place from './ui/screens/place.js';
import * as journeys from './ui/screens/journeys.js';
import * as trip from './ui/screens/trip.js';
import * as forty from './ui/screens/forty.js';
import * as story from './ui/screens/story.js';
import * as today from './ui/screens/today.js';
import * as searchScreen from './ui/screens/search.js';
import * as more from './ui/screens/more.js';
import * as planScreen from './ui/screens/plan.js';
import * as settle from './ui/screens/settle.js';
import * as deals from './ui/screens/deals.js';
import * as expense from './ui/expense.js';
import * as emergency from './ui/emergency.js';
import * as share from './ui/share.js';
import * as documents from './ui/screens/documents.js';
import { ZONES } from './core/domain.js';
import { enhance, transition } from './ui/motion.js';
import { installPalette } from './ui/palette.js';

const CONFIG = JSON.parse(document.getElementById('elsewhere-config').textContent);
const A = CONFIG.assetBase;
const ROUTES = [
  ['/', explore.home], ['/explore', explore.home],
  ['/place/new', place.edit], ['/place/:id/edit', place.edit], ['/place/:id', place.view],
  ['/journeys', journeys.list], ['/journeys/new', journeys.create], ['/wallet', journeys.wallet], ['/settle', settle.view], ['/deals', deals.view], ['/documents', documents.view], ['/journeys/:id', trip.view], ['/journeys/:id/:tab', trip.view],
  ['/forty', forty.list], ['/forty/:id/swap', forty.swap], ['/forty/:id', forty.entry],
  ['/story', story.view], ['/story/:code', story.country],
  ['/plan', planScreen.view], ['/today', today.view], ['/search', searchScreen.view],
  ['/more', more.index], ['/more/:section', more.section], ['/prepare/:scope', more.prepare],
];
const NAV = [['/', 'Explore', 'explore'], ['/plan', 'Plan', 'map'], ['/journeys', 'Journeys', 'journeys'], ['/forty', 'The forty', 'forty'], ['/story', 'Travel story', 'story'], ['/today', 'Today', 'today']];

function match(path) {
  for (const [pattern, screen] of ROUTES) {
    const pp = pattern.split('/').filter(Boolean), sp = path.split('/').filter(Boolean);
    if (pp.length !== sp.length) continue;
    const params = {}; let ok = true;
    pp.forEach((p, i) => { if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(sp[i]); else if (p !== sp[i]) ok = false; });
    if (ok) return { screen, params };
  }
  return null;
}

const ctx = { config: CONFIG, A, actions: {}, forms: {}, cleanups: [] };
for (const m of [explore, place, journeys, trip, forty, story, today, searchScreen, more, planScreen, settle, deals, documents, expense, emergency, share]) { Object.assign(ctx.actions, m.actions || {}); Object.assign(ctx.forms, m.forms || {}); }

ctx.nav = (url, { replace = false } = {}) => {
  history.replaceState({ ...(history.state || {}), scroll: scrollY }, '');
  if (replace) history.replaceState({ scroll: 0 }, '', url); else history.pushState({ scroll: 0 }, '', url);
  transition(() => render({ scroll: 0, focus: true }));
};
ctx.setQuery = (patch) => { const u = new URL(location.href); for (const [k, v] of Object.entries(patch)) { if (v === '' || v === null || v === undefined) u.searchParams.delete(k); else u.searchParams.set(k, v); } history.replaceState({ ...(history.state || {}), scroll: scrollY }, '', u); render({ scroll: scrollY }); };
ctx.rerender = () => render({ scroll: scrollY });
ctx.toast = toast;

let current = null, pendingRender = false;
async function render({ scroll = 0, focus = false } = {}) {
  const main = document.getElementById('main');
  const act = document.activeElement, keepFocus = act?.id && main.contains(act) ? { id: act.id, start: act.selectionStart, end: act.selectionEnd } : null;
  for (const c of ctx.cleanups.splice(0)) try { c(); } catch {}
  const url = new URL(location.href);
  const m = match(url.pathname.replace(/\/+$/, '') || '/');
  ctx.route = { path: url.pathname, params: m?.params || {}, query: Object.fromEntries(url.searchParams) };
  current = m?.screen;
  let out;
  try { out = m ? m.screen.render(ctx) : notFound(); }
  catch (e) { console.error(e); out = { title: 'Something went wrong', html: '<section class="page narrow"><h1>That screen could not open.</h1><p>' + esc(e.message) + '</p><a class="btn" href="/">Back to Explore</a></section>' }; }
  document.title = (out.title ? out.title + ' · ' : '') + 'Wanderlust';
  main.innerHTML = out.html;
  main.dataset.screen = out.screen || '';
  document.querySelectorAll('[data-navlink]').forEach(a => { const href = a.getAttribute('href'); const on = href === '/' ? ['/', '/explore'].includes(url.pathname) || url.pathname.startsWith('/place') : url.pathname.startsWith(href); a.toggleAttribute('aria-current', false); if (on) a.setAttribute('aria-current', 'page'); });
  if (keepFocus && !focus) { const el = document.getElementById(keepFocus.id); if (el) { el.focus({ preventScroll: true }); try { if (keepFocus.start != null) el.setSelectionRange(keepFocus.start, keepFocus.end); } catch {} } }
  if (out.mount) await out.mount(main, ctx);
  enhance(main);
  // Scrollable tables and the timeline are keyboard-reachable regions.
  main.querySelectorAll('.table-wrap, .tl-scroll').forEach(el => { el.tabIndex = 0; el.setAttribute('role', 'region'); el.setAttribute('aria-label', (el.closest('section')?.querySelector('h2')?.textContent || 'Table') + ', scrollable'); });
  // Attachments from this device (or downloaded on demand) for any screen that shows them.
  if (main.querySelector('img[data-file]:not([src])')) { const { fileURL } = await import('./core/files.js'); for (const img of main.querySelectorAll('img[data-file]:not([src])')) fileURL(ctx.store, ctx.sync, img.dataset.file).then(u => { img.src = u; }).catch(() => img.remove()); }
  requestAnimationFrame(() => { scrollTo({ top: scroll, behavior: 'instant' }); if (focus) { const h = main.querySelector('h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } } });
}
const notFound = () => ({ title: 'Not found', html: '<section class="page narrow"><h1>Nothing here yet.</h1><p>This address does not match a screen in Wanderlust.</p><a class="btn primary" href="/">Go to Explore</a></section>' });

// ---------- shell chrome ----------
function shell() {
  document.getElementById('app').innerHTML =
    '<a class="skip" href="#main">Skip to content</a>' +
    '<header class="top"><a class="brand" href="/" aria-label="Wanderlust, Explore">wanderlust<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 1L23.2 15.5L34.1 5.9L24.5 16.8L39 20L24.5 23.2L34.1 34.1L23.2 24.5L20 39L16.8 24.5L5.9 34.1L15.5 23.2L1 20L15.5 16.8L5.9 5.9L16.8 15.5Z" fill="currentColor"/></svg></a>' +
    '<nav class="primary" aria-label="Main">' + NAV.map(([h, l, i]) => '<a href="' + h + '" data-navlink>' + icon(i) + '<span>' + l + '</span></a>').join('') + '</nav>' +
    '<div class="top-tools"><form class="gsearch" role="search" data-form="globalSearch"><label class="sr" for="gq">Search everything</label>' + icon('search') + '<input id="gq" name="q" type="search" placeholder="Search places, trips, bookings…" autocomplete="off"></form>' +
    '<a class="syncchip" id="syncchip" href="/more/sync" aria-live="polite"></a><a class="dealbtn" href="/deals?search=1" title="Search flight deals now">' + icon('plane') + '<span>Flight deals</span></a><button class="iconbtn" data-act="openPalette" aria-label="Quick jump (Command K)" title="Quick jump (⌘K)" data-mobile-only>' + icon('search') + '</button><button class="menubtn" id="menubtn" aria-label="Menu" aria-haspopup="true" aria-expanded="false" aria-controls="moremenu" data-act="toggleMenu">' + icon('menu') + '<span>Menu</span></button></div></header>' + moreMenu() +
    '<div id="banner" role="status"></div><main id="main" tabindex="-1"></main>' +
    '<nav class="bottom" aria-label="Main">' + NAV.map(([h, l, i]) => '<a href="' + h + '" data-navlink>' + icon(i) + '<span>' + (l === 'The forty' ? 'The forty' : l === 'Travel story' ? 'Story' : l) + '</span></a>').join('') + '</nav>' +
    '<div id="toast" class="toast" role="status" aria-live="polite"></div><datalist id="zones">' + ZONES.map(z => '<option value="' + z + '">').join('') + '</datalist>';
}
// The labelled menu behind the header's Menu button: appearance, trips and money, your data, app.
const MENU = [['Trips & money', [['/deals', 'Flight deals', 'Watch fares and search for deals', 'tag'], ['/wallet', 'Wallet', 'Every booking in one place', 'file'], ['/settle', 'Settle up', 'Who owes whom, across trips', 'swap'], ['/documents', 'Documents', 'Passports and tickets, this device only', 'lock']]],
  ['Your data', [['/more/sync', 'Sync & account', 'Status, who is signed in', 'sync'], ['/more/conflicts', 'Decisions waiting', 'Edits that need your choice', 'alert'], ['/more/offline', 'Offline & downloads', 'Maps and trips for no signal', 'download'], ['/more/backup', 'Backup & restore', 'Save or restore everything', 'lock'], ['/more/import', 'Import & export', 'Spreadsheets, calendar, files', 'file']]],
  ['App', [['/more/settings', 'Settings', 'Reminders, target date, preferences', 'edit'], ['/more/device', 'Data on this device', 'Storage and clearing', 'lock'], ['/more/about', 'How offline works', 'What needs a connection', 'cloud'], ['/more/credits', 'Photo & map credits', 'Photographers and licences', 'camera']]]];
function moreMenu() {
  return '<div class="moremenu" id="moremenu" hidden><h3>Appearance</h3><div class="themeseg" role="group" aria-label="Theme">' + [['auto', 'Auto', 'auto'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, l, i]) => '<button type="button" data-act="setTheme" data-theme-choice="' + v + '" aria-pressed="false">' + icon(i) + l + '</button>').join('') + '</div>' +
    MENU.map(([h, items]) => '<h3>' + h + '</h3><ul>' + items.map(([href, l, d, i]) => '<li><a href="' + href + '">' + icon(i) + '<span><b>' + l + '</b><small>' + d + '</small></span></a></li>').join('') + '</ul>').join('') + '</div>';
}
function themeNow() { try { return localStorage.getItem('wl-theme') || 'auto'; } catch { return 'auto'; } }
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { if (t === 'auto') localStorage.removeItem('wl-theme'); else localStorage.setItem('wl-theme', t); } catch {}
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === t)));
}
function closeMenu(focus) { const m = document.getElementById('moremenu'), b = document.getElementById('menubtn'); if (!m || m.hidden) return; m.hidden = true; b?.setAttribute('aria-expanded', 'false'); if (focus) b?.focus(); }
ctx.actions.toggleMenu = () => { const m = document.getElementById('moremenu'), b = document.getElementById('menubtn'); if (!m.hidden) return closeMenu(); applyTheme(themeNow()); m.hidden = false; b.setAttribute('aria-expanded', 'true'); m.querySelector('a,button')?.focus(); };
ctx.actions.setTheme = el => { applyTheme(el.dataset.themeChoice); };
document.addEventListener('click', e => { const m = document.getElementById('moremenu'); if (m && !m.hidden && !e.target.closest('#moremenu,#menubtn')) closeMenu(); if (e.target.closest('#moremenu a')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(true); });
const LABEL = { local: ['On this device', 'cloud'], idle: ['Saved here', 'cloud'], syncing: ['Syncing…', 'sync'], synced: ['Synced', 'check'], pending: ['Waiting to sync', 'sync'], offline: ['Offline · saved here', 'offline'], 'signed-out': ['Sign in to sync', 'alert'], error: ['Sync paused · will retry', 'alert'], conflict: ['Needs your decision', 'alert'], account: ['Different account', 'alert'] };
function paintSync() {
  const s = ctx.sync.status, chip = document.getElementById('syncchip'); if (!chip) return;
  let state = s.state; if (state === 'synced' && s.pending) state = 'pending';
  if (s.conflicts) state = 'conflict';
  const [label, ic] = LABEL[state] || LABEL.idle;
  chip.className = 'syncchip s-' + state; const full = label + (s.pending && state !== 'syncing' ? ' · ' + s.pending : ''); chip.innerHTML = icon(ic) + '<span>' + esc(full) + '</span>'; chip.setAttribute('aria-label', 'Sync status: ' + full);
  chip.title = 'Last synced: ' + ago(s.lastPull) + (s.error ? ' · ' + s.error : '');
  const b = document.getElementById('banner');
  if (state === 'signed-out') b.innerHTML = '<div class="banner warn">' + icon('lock') + '<span>Cloud sync needs you to sign in again. Everything you change is still saved on this device.</span><a class="btn small" href="/?signin=1" data-hard>Sign in</a></div>';
  else if (state === 'conflict') b.innerHTML = '<div class="banner warn">' + icon('alert') + '<span>' + s.conflicts + (s.conflicts === 1 ? ' change needs' : ' changes need') + ' your decision before syncing.</span><a class="btn small" href="/more/conflicts">Review</a></div>';
  else if (state === 'account') b.innerHTML = '<div class="banner warn">' + icon('alert') + '<span>' + esc(s.error) + '</span><a class="btn small" href="/more/device">Device data</a></div>';
  else if (!b.querySelector('[data-update]')) b.innerHTML = '';
}

// ---------- global events ----------
document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act && ctx.actions[act.dataset.act]) { e.preventDefault(); Promise.resolve(ctx.actions[act.dataset.act](act, ctx, e)).catch(err => toast(err.message || String(err), { tone: 'error' })); return; }
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || a.dataset.hard !== undefined || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || /^\/(api|images|app|maps|mcp)\//.test(u.pathname)) return;
  e.preventDefault();
  if (u.pathname + u.search === location.pathname + location.search && !u.hash) return;
  ctx.nav(u.pathname + u.search + u.hash);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f || !ctx.forms[f.dataset.form]) return;
  e.preventDefault();
  const btn = e.submitter; if (btn) btn.disabled = true;
  Promise.resolve(ctx.forms[f.dataset.form](f, ctx, e)).then(() => f.removeAttribute('data-dirty')).catch(err => { toast(err.message || String(err), { tone: 'error' }); const msg = f.querySelector('.form-error'); if (msg) msg.textContent = err.message; }).finally(() => { if (btn?.isConnected) btn.disabled = false; });
});
document.addEventListener('input', e => { const f = e.target.closest('main form'); if (f && !f.dataset.live) f.dataset.dirty = '1'; });
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el && ctx.actions[el.dataset.input]) ctx.actions[el.dataset.input](el, ctx, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && ctx.actions[el.dataset.change]) Promise.resolve(ctx.actions[el.dataset.change](el, ctx, e)).catch(err => toast(err.message, { tone: 'error' })); });
addEventListener('popstate', e => render({ scroll: e.state?.scroll || 0 }));
addEventListener('beforeunload', () => history.replaceState({ ...(history.state || {}), scroll: scrollY }, ''));

// ---------- data space & boot ----------
async function whoami() {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try { const r = await fetch('/api/whoami', { credentials: 'same-origin', redirect: 'manual', cache: 'no-store', signal: ctl.signal }); if (r.type === 'opaqueredirect' || !r.ok || !(r.headers.get('Content-Type') || '').includes('json')) return { auth: r.type === 'opaqueredirect' || r.status === 401 }; return await r.json(); }
  catch { return { offline: true }; } finally { clearTimeout(t); }
}

async function boot() {
  shell();
  const main = document.getElementById('main');
  main.innerHTML = '<section class="loading" aria-busy="true"><div class="loader">' + icon('spark') + '</div><p>Opening your atlas…</p></section>';
  const seed = await (await fetch(A + 'data/seed.json')).json();
  Object.assign(ctx, { SEED: seed.places, PROFILE_SEED: seed.profile, FORTY: seed.forty, PHOTOS: seed.photos, SCENES: seed.scenes, PLAN: seed.plan, EMERGENCY: seed.emergency });
  const packaged = CONFIG.mode === 'packaged';
  let space = packaged ? 'local-device' : null, who = null;
  const last = await deviceGet('lastSpace');
  if (!packaged) { who = await whoami(); space = who.space || last; }
  if (!space) { main.innerHTML = firstRun(who); return; }
  if (who?.space && last && who.space !== last) toast('This site uses a different Wanderlust account. Its data is kept separately on this device.');
  await deviceSet('lastSpace', space);
  const spaces = new Set((await deviceGet('spaces')) || []); spaces.add(space); await deviceSet('spaces', [...spaces]);
  const db = await openDatabase(spaceDbName(space));
  const store = await new Store(db, { space, localOnly: packaged }).load();
  const sync = new Sync(store, { localOnly: packaged });
  Object.assign(ctx, { store, sync, db, space, signedOut: !!who?.auth, person: who?.person || (await deviceGet('person')) || null });
  if (who?.person) await deviceSet('person', who.person);
  if (store.isEmpty) {
    if (packaged) await store.replaceFrom({ places: seed.places, profile: seed.profile, hub: { version: 1, records: {} }, forty: { version: 1, selection: seed.forty.entries.filter(e => e.group === 'core').map(e => e.id) }, settings: { version: 1, values: {} } }, { seeded: true });
    else { main.innerHTML = '<section class="loading" aria-busy="true"><div class="loader">' + icon('sync') + '</div><p>Downloading your travel data to this device…</p></section>'; await sync.run('first'); ctx.firstSynced = true; if (store.isEmpty) { main.innerHTML = firstRun({ offline: true }); return; } }
  } else if (packaged) await store.addMissingSeedPlaces(seed.places);
  store.addEventListener('change', () => { if (document.querySelector('main form[data-dirty]') || ctx.holdRender > 0) { pendingRender = true; return; } clearTimeout(ctx._rt); ctx._rt = setTimeout(() => { if (document.querySelector('main form[data-dirty]') || ctx.holdRender > 0) { pendingRender = true; return; } ctx.rerender(); }, 30); });
  store.addEventListener('change', e => { if (!e.detail.kinds.includes('*') && !e.detail.kinds.includes('sync')) sync.soon(); paintSync(); });
  sync.addEventListener('status', paintSync);
  document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !document.querySelector('main form[data-dirty]')) { pendingRender = false; ctx.rerender(); } }, 50));
  const net = () => document.body.classList.toggle('is-offline', !navigator.onLine); net();
  addEventListener('online', () => { net(); sync.run('online'); });
  addEventListener('offline', () => { net(); sync.set('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.run('visible'); });
  setInterval(() => { if (document.visibilityState === 'visible' && store.pending) sync.run('interval'); }, 60000);
  await runPlanMigration(store);
  installPalette(ctx);
  paintSync();
  await render({ scroll: history.state?.scroll || 0 });
  if (!packaged) { if (!ctx.firstSynced) sync.run('open'); registerSW(); }
  if (new URL(location.href).searchParams.has('signin')) history.replaceState(null, '', location.pathname);
}
// Versioned data migration: loads the starter plan settings once per data space. A full backup of this
// device's copy is kept first (More → Backup & restore can still export it), and the change syncs
// like any other edit, so other devices replay it as duplicates rather than applying it twice.
async function runPlanMigration(store) {
  if (!ctx.PLAN || store.get('setting', 'planLoaded')) return runPhase2Migration(store);
  try {
    const { planOps } = await import('./core/plan.js'), { buildBackup } = await import('./core/backup.js');
    const ops = planOps(store, ctx.PLAN, ctx.FORTY); if (!ops.length) return;
    await store.setMeta('backupBeforePlan', { at: new Date().toISOString(), backup: await buildBackup(store, { appVersion: CONFIG.build }) });
    await store.commit(ops);
    
    await runPhase2Migration(store);
  } catch (e) { console.error('Plan migration failed', e); toast('The plan could not be loaded on this device. Nothing was changed.', { tone: 'error' }); }
}
async function runPhase2Migration(store) {
  try { const { phase2Ops, phase5Ops } = await import('./core/plan.js'); if (!store.get('setting', 'planPhase2')) { const ops = phase2Ops(store); if (ops.length) await store.commit(ops); } if (!store.get('setting', 'planPhase5')) { const ops = phase5Ops(store, ctx.PLAN); if (ops.length) await store.commit(ops); } }
  catch (e) { console.error('Plan migration failed', e); toast('The plan could not be loaded on this device. Nothing was changed.', { tone: 'error' }); }
}
function firstRun(who) {
  return '<section class="page narrow firstrun">' + '<p class="eyebrow">Wanderlust</p><h1>Connect once to prepare this device.</h1>' +
    (who?.auth ? '<p>Sign in to your private Wanderlust site. After the first download, your atlas, journeys and files open on this device without a connection.</p><a class="btn primary" href="/?signin=1" data-hard>Sign in</a>'
      : '<p>This device has not downloaded your Wanderlust data yet, and there is no connection right now. A website cannot fetch your private records without the network the first time.</p><p>Reconnect and reopen Wanderlust. If you need a copy that starts with no connection at all, use the packaged desktop app or restore a full backup from <a href="/more/backup">Backup &amp; restore</a>.</p><button class="btn primary" data-act="reload">Try again</button>') + '</section>';
}
ctx.actions.reload = () => location.reload();
ctx.actions.print = () => print();
ctx.forms.globalSearch = f => { const q = f.q.value.trim(); ctx.nav('/search' + (q ? '?q=' + encodeURIComponent(q) : '')); f.q.blur(); };

// ---------- service worker: versioned, never forced while there are unsent changes ----------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    ctx.swReg = reg;
    const offer = w => {
      const b = document.getElementById('banner');
      b.innerHTML = '<div class="banner" data-update>' + icon('spark') + '<span>A new version of Wanderlust is ready.' + (ctx.store.pending ? ' Your ' + ctx.store.pending + ' unsent change(s) are safe on this device and carry over.' : '') + '</span><button class="btn small" data-act="applyUpdate">Restart to update</button></div>';
      ctx.waitingSW = w;
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
    navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'flush') ctx.sync.run('background'); });
    let reloading = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (ctx.updating && !reloading) { reloading = true; location.reload(); } });
    if ('sync' in reg) ctx.store.addEventListener('change', () => { if (ctx.store.pending) reg.sync.register('elsewhere-outbox').catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60000);
  } catch (e) { console.warn('Service worker unavailable', e); }
}
ctx.actions.applyUpdate = async () => {
  if (document.querySelector('main form[data-dirty]')) { toast('Save or cancel the form you are editing first.'); return; }
  ctx.updating = true; ctx.waitingSW?.postMessage({ type: 'skipWaiting' });
};

boot().catch(e => { console.error(e); document.getElementById('main').innerHTML = '<section class="page narrow"><h1>Wanderlust could not open its data on this device.</h1><p>' + esc(e.message) + '</p><p>Your saved data has not been changed. Close other Wanderlust tabs and try again.</p><button class="btn primary" onclick="location.reload()">Try again</button></section>'; });
window.__elsewhere = ctx;

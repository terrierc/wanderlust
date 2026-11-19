// Smoke test against `netlify dev` (or a deployed URL): passphrase gate, sync, upload, map region, offline reload.
//   WANDERLUST_URL=http://localhost:8888 WANDERLUST_TEST_PASSPHRASE=... node scripts/netlify-smoke.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.WANDERLUST_URL || 'http://localhost:8888', PASS = process.env.WANDERLUST_TEST_PASSPHRASE;
const b = await chromium.launch(), ctx = await b.newContext(), p = await ctx.newPage(); const log = s => console.log('✓', s);
await p.goto(BASE + '/'); assert.match(await p.textContent('body'), /Passphrase/); log('locked page shown');
await p.fill('#p', 'wrong-passphrase-xx'); await p.click('button'); assert.match(await p.textContent('body'), /did not match/); log('wrong passphrase refused');
await p.fill('#p', PASS); await p.click('button'); await p.waitForFunction(() => window.__elsewhere?.sync?.status.state === 'synced', null, { timeout: 60000 }); log('unlocked and synced');
await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForFunction(() => !!navigator.serviceWorker.controller && window.__elsewhere?.store); log('service worker installed');
await p.evaluate(() => window.__elsewhere.store.patch('trip', 'stans', { nextAction: 'Netlify smoke ' + Date.now() })); const st = await p.evaluate(() => window.__elsewhere.sync.run('t').then(() => window.__elsewhere.sync.status)); assert.equal(st.pending, 0); log('edit synced to Netlify Blobs');
const r = await p.evaluate(async () => { const c = window.__elsewhere, o = await import(c.A + 'offline.js'); const reg = (await c.sync.request('/api/maps')).regions.find(x => x.id === 'ningaloo'); const d = await o.downloadRegion(c.store, c.sync, reg); return d.state + ' ' + (d.sha256 === reg.sha256); }); assert.equal(r, 'ready true'); log('map region downloaded and verified');
await ctx.setOffline(true); await p.goto(BASE + '/forty'); await p.waitForFunction(() => window.__elsewhere?.store); assert.match(await p.textContent('h1'), /Forty before/); log('reopened offline from the installed app');
await b.close(); console.log('Netlify smoke test passed.');

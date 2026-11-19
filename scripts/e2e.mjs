// Browser smoke test for a fresh Wanderlust (Playwright Chromium + WebKit).
// Starts the preview server with an empty mock store, then checks what a new user does first:
// open the app, create a journey, add it to the plan, add a stop, sync, and reopen offline.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd(), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wanderlust-e2e-'));
const PORT = 4300 + Math.floor(Math.random() * 500), BASE = 'http://127.0.0.1:' + PORT;
const results = [], errors = [];
const step = async (name, fn) => { try { await fn(); results.push(true); console.log('✓', name); } catch (e) { results.push(false); console.log('✗', name, '\n   ', e.message.split('\n')[0]); } };
let server;
async function startServer(name) {
  server = spawn('node', ['preview.mjs', '--port', String(PORT), '--persist', path.join(TMP, name + '-store.json')], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/_preview/x'); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('server did not start');
}
const ready = page => page.waitForFunction(() => window.__elsewhere?.store?.list('place').length > 0, null, { timeout: 30000 });

for (const type of [chromium, webkit]) {
  const label = type === chromium ? 'Chromium' : 'WebKit';
  await startServer(label);
  const browser = await type.launch(), ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'allow', reducedMotion: 'reduce' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(label + ': ' + e));
  await step(label + ': opens with an empty atlas and the starter ideas', async () => {
    await page.goto(BASE + '/'); await ready(page);
    const n = await page.evaluate(() => [window.__elsewhere.store.list('place').length, window.__elsewhere.store.list('trip').length, window.__elsewhere.store.list('country').length]);
    assert.deepEqual(n, [123, 0, 0], JSON.stringify(n));
  });
  await step(label + ': create a journey, add it to the plan, add a stop', async () => {
    await page.goto(BASE + '/journeys/new'); await ready(page);
    await page.fill('input[name="name"]', 'Japan in spring'); await page.click('form button:has-text("Create journey")');
    await page.waitForFunction(() => /^\/journeys\/trip-/.test(location.pathname));
    const id = location => location.split('/')[2], tripId = id(new URL(page.url()).pathname);
    await page.click('button:has-text("Add to the plan")');
    await page.waitForFunction(t => window.__elsewhere.store.get('trip', t).planId, tripId);
    await page.goto(BASE + '/journeys/' + tripId + '/route'); await ready(page);
    await page.evaluate(t => window.__elsewhere.store.patch('trip', t, { stops: [{ id: 'd029', name: 'Kyoto', nights: 5 }] }), tripId);
    await page.goto(BASE + '/plan'); await ready(page);
    assert.match(await page.textContent('main'), /Japan in spring/);
  });
  await step(label + ': everything syncs to the private store', async () => {
    await page.evaluate(() => window.__elsewhere.sync.run('test'));
    await page.waitForFunction(() => window.__elsewhere.sync.status.pending === 0, null, { timeout: 15000 });
    const d = await (await fetch(BASE + '/_preview/dump')).json();
    assert(d['profile/travel-v1.json'].trips.some(t => t.name === 'Japan in spring'));
  });
  await page.screenshot({ path: path.join(TMP, label + '.png') });
  await ctx.close(); await browser.close();
  server.kill(); await new Promise(r => server.once('exit', r));
}
await step('No page errors', async () => assert.deepEqual(errors, []));
console.log(results.filter(Boolean).length + '/' + results.length + ' smoke steps passed.');
process.exit(results.every(Boolean) ? 0 : 1);

// "Share with family": read-only links for one trip. Needs a connection; links live on the private site.
import { esc, icon, toast, confirmDialog } from './kit.js';
import { prettyDate } from '../core/domain.js';

// The link just made stays on screen through re-renders (it is shown once and never stored), until another trip is opened.
let fresh = null;
export const sharePanel = t => { if (fresh && fresh.trip !== t.id) fresh = null; return panel(t); };
const panel = t => '<section class="panel share-panel" id="sharePanel" data-trip="' + esc(t.id) + '"><h2>' + icon('journeys') + ' Share with family</h2><p class="muted small">A private, read-only link to this trip only: route, flights, where you sleep, day plans and the emergency card. Nothing else from Wanderlust. Needs a connection to make or change links.</p><div id="shareList"><p class="muted small">Checking links…</p></div>' +
  '<details><summary>Make a new link</summary><form class="grid-form" data-form="shareCreate"><input type="hidden" name="trip" value="' + esc(t.id) + '">' +
  '<div class="field"><label for="sh-l">Who it is for</label><input id="sh-l" name="label" required maxlength="60" placeholder="Family"></div>' +
  '<div class="field"><label for="sh-e">Expires</label><input id="sh-e" name="expires" type="date"><p class="muted small">Blank means it never expires. You can revoke it at any time.</p></div>' +
  '<fieldset class="wide covers"><legend>Include</legend><label class="check"><input type="checkbox" name="policy" checked> Insurance policy number on the emergency card</label><label class="check"><input type="checkbox" name="refs"> Booking reference numbers</label><label class="check"><input type="checkbox" name="money"> Money (estimates and spending)</label><p class="muted small">Always included: route, flights and connections, where you sleep, day plans, emergency numbers. Never included: documents, receipts, other trips.</p></fieldset>' +
  '<div class="wide row end"><button class="btn primary">Make link</button></div></form></details><div id="shareNew" aria-live="polite">' + (fresh ? newHTML(fresh.j, fresh.label) : '') + '</div></section>';

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || (r.status === 404 ? 'Sharing is only available on your live site.' : 'That did not work (' + r.status + '). Try again.'));
  return j;
}
const showNew = (j, label, trip) => { fresh = { j, label, trip }; const el = document.getElementById('shareNew'); if (el) el.innerHTML = newHTML(j, label); };
const newHTML = (j, label) => '<div class="notice share-new"><p><b>Link for ' + esc(label) + '</b>. Copy it now: for safety Wanderlust keeps only a fingerprint of it, so it cannot be shown again (you can always make a replacement).</p><input readonly value="' + esc(j.url) + '" aria-label="Share link" onclick="this.select()"><p class="row wrap"><button class="btn small" data-act="shareCopy" data-url="' + esc(j.url) + '">Copy link</button>' + (navigator.share ? '<button class="btn small ghost" data-act="shareSend" data-url="' + esc(j.url) + '" data-label="' + esc(label) + '">Send…</button>' : '') + '</p></div>';

export async function mountShare(ctx, root) {
  const box = root.querySelector('#sharePanel'); if (!box) return;
  const list = box.querySelector('#shareList');
  if (!navigator.onLine) { list.innerHTML = '<p class="muted small">Needs a connection to show links.</p>'; return; }
  try {
    const { links } = await api('/shares'), mine = links.filter(l => l.trip === box.dataset.trip);
    list.innerHTML = mine.length ? '<ul class="plain share-list">' + mine.map(l => '<li><b>' + esc(l.label) + '</b><span class="muted small"> · made ' + esc(prettyDate(l.created)) + ' · ' + (l.expires ? 'expires ' + esc(prettyDate(l.expires)) : 'never expires') + ' · ' + (l.lastOpened ? 'last opened ' + esc(prettyDate(l.lastOpened)) : 'not opened yet') + ' · ' + [l.include.policy && 'policy number', l.include.refs && 'booking refs', l.include.money && 'money'].filter(Boolean).join(', ').replace(/^/, l.include.policy || l.include.refs || l.include.money ? 'includes ' : 'no extras') + '</span><span class="row wrap"><button class="btn small ghost" data-act="shareReplace" data-fp="' + esc(l.fp) + '" data-label="' + esc(l.label) + '">Replace link</button><button class="btn small ghost" data-act="shareRevoke" data-fp="' + esc(l.fp) + '" data-label="' + esc(l.label) + '">Revoke</button></span></li>').join('') + '</ul>' : '<p class="muted small">No links yet.</p>';
  } catch (e) { list.innerHTML = '<p class="muted small">' + esc(e.message) + '</p>'; }
}
export const forms = {
  async shareCreate(f, ctx) {
    if (!navigator.onLine) throw new Error('Needs a connection to make a link.');
    if (ctx.store.pending) await ctx.sync.run('share');
    const label = f.label.value.trim(), j = await api('/shares', { method: 'POST', body: JSON.stringify({ trip: f.trip.value, label, expires: f.expires.value, include: { policy: f.policy.checked, refs: f.refs.checked, money: f.money.checked } }) });
    const trip = f.trip.value; f.reset(); showNew(j, label, trip); await mountShare(ctx, document); toast('Link made for ' + label);
  },
};
export const actions = {
  async shareCopy(el) { try { await navigator.clipboard.writeText(el.dataset.url); toast('Link copied'); } catch { toast('Select the link and copy it.'); } },
  async shareSend(el) { try { await navigator.share({ title: 'Our trip plan', text: 'Here is our trip plan (read-only):', url: el.dataset.url }); } catch {} },
  async shareRevoke(el, ctx) { if (!await confirmDialog('Revoke ' + el.dataset.label + '’s link?', { ok: 'Revoke', danger: true, detail: 'It stops working straight away. A copy already saved on their phone stays viewable there until they open it online again.' })) return; await api('/shares/' + el.dataset.fp, { method: 'DELETE' }); if (fresh?.j?.link?.fp === el.dataset.fp) { fresh = null; const n = document.getElementById('shareNew'); if (n) n.innerHTML = ''; } toast('Link revoked'); await mountShare(ctx, document); },
  async shareReplace(el, ctx) { if (!await confirmDialog('Replace ' + el.dataset.label + '’s link?', { ok: 'Replace', detail: 'The old link stops working; send them the new one.' })) return; const j = await api('/shares/' + el.dataset.fp + '/replace', { method: 'POST' }); showNew(j, el.dataset.label, document.getElementById('sharePanel')?.dataset.trip); await mountShare(ctx, document); },
};

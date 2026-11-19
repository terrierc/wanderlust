// Settle up: net balances and the fewest transfers, per trip or across all trips.
import { esc, icon, toast, confirmDialog } from '../kit.js';
import { money, prettyDate, todayISO } from '../../core/domain.js';
import { balances, transfers, nameOf } from '../../core/shared.js';
import { newId } from '../../core/store.js';
import { getRates } from '../rates.js';
export function settleHTML(ctx, trips, scope = '') {
  const N = id => esc(nameOf(ctx.store, id));
  const { by, undecided } = balances(ctx.store, trips), tr = transfers(by);
  const hist = ctx.store.list('settlements').filter(s => !scope || s.trip === scope).sort((a, b) => b.date.localeCompare(a.date));
  return '<section class="panel"><h2>Settle up</h2><p class="muted small">From money actually paid. Each currency is settled separately unless you choose to settle in AUD.</p>' +
    (Object.keys(by).length ? '<ul class="plain">' + Object.entries(by).map(([cur, b]) => '<li><b>' + esc(cur) + '</b> · ' + Object.entries(b).filter(([p, v]) => Math.abs(v) > 0.004 || ['me', 'partner'].includes(p)).map(([p, v]) => N(p) + ' ' + money(Math.round(v * 100) / 100, cur)).join(' · ') + '</li>').join('') + '</ul>' : '<p class="muted">Nothing paid yet.</p>') +
    (tr.length ? '<h3>To clear it</h3><ul class="plain">' + tr.map(x => '<li class="row between"><span>' + N(x.from) + ' pays ' + N(x.to) + ' <b>' + money(x.amount, x.currency) + '</b></span><span class="row"><button class="btn small" data-act="settleDone" data-from="' + x.from + '" data-to="' + x.to + '" data-amount="' + x.amount + '" data-currency="' + esc(x.currency) + '" data-trip="' + esc(scope) + '">Mark as settled</button>' + (x.currency !== 'AUD' ? '<button class="btn small ghost" data-act="settleDone" data-aud="1" data-from="' + x.from + '" data-to="' + x.to + '" data-amount="' + x.amount + '" data-currency="' + esc(x.currency) + '" data-trip="' + esc(scope) + '">Settled in AUD</button>' : '') + '</span></li>').join('') + '</ul>' : Object.keys(by).length ? '<p>All square.</p>' : '') +
    (undecided.length ? '<p class="flag-line">' + undecided.length + ' paid item(s) need “who paid” or “who it covers” before they count.</p>' : '') +
    (hist.length ? '<details><summary>Settlement history (' + hist.length + ')</summary><ul class="plain">' + hist.map(s => '<li>' + esc(prettyDate(s.date)) + ' · ' + N(s.from) + ' paid ' + N(s.to) + ' ' + money(Number(s.amount), s.currency) + (s.paidAs ? ' · ' + esc(s.paidAs) : '') + '</li>').join('') + '</ul></details>' : '') + '</section>';
}
export const view = { render(ctx) { const trips = ctx.store.list('trip'); return { title: 'Settle up', html: '<section class="page narrow"><a class="back" href="/more">' + icon('back') + ' More</a><h1>Settle up, all trips</h1>' + settleHTML(ctx, trips, '') + '</section>' }; } };
export const actions = {
  async settleDone(el, ctx) {
    const d = el.dataset, amount = Number(d.amount); let paidAs = '';
    if (d.aud) { const r = await getRates(ctx), rate = r?.rates?.[d.currency]; if (!rate) { toast('No rate for ' + d.currency + ' on this device. Settle in ' + d.currency + ' instead.'); return; } paidAs = 'paid as ' + money(Math.round(amount / rate * 100) / 100, 'AUD') + ' at the ECB rate of ' + r.date; }
    if (!await confirmDialog('Record ' + nameOf(ctx.store, d.from) + ' paying ' + nameOf(ctx.store, d.to) + ' ' + money(amount, d.currency) + '?', { ok: 'Record as settled', detail: paidAs ? 'Settled in AUD: ' + paidAs + '.' : '' })) return;
    await ctx.store.create('settlements', { id: newId('settle'), trip: d.trip || '', from: d.from, to: d.to, amount: String(amount), currency: d.currency, date: todayISO(), paidAs, done: true }); toast('Settled. It stays in the history.');
  },
};
export const forms = {};

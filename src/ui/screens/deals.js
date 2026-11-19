// Deals board: routes you watch, your logged fares and targets. Green means your latest fare is at or below target.
import { esc, icon, field, formValues, toast, ext } from '../kit.js';
import { newId } from '../../core/store.js';
import { money, prettyDate, todayISO } from '../../core/domain.js';
import { routeStats } from '../../core/fares.js';
function spark(log) {
  if (log.length < 2) return '';
  const v = log.map(f => +f.price), lo = Math.min(...v), hi = Math.max(...v), w = 160, h = 36;
  const pts = v.map((p, i) => (i / (v.length - 1) * w).toFixed(1) + ',' + (hi === lo ? h / 2 : h - (p - lo) / (hi - lo) * h).toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Price history, ' + v.length + ' fares"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
}
export const view = {
  render(ctx) {
    const routes = [...new Set([...ctx.store.list('fares').map(f => f.route), ...ctx.store.list('fareTargets').map(t => t.route)])].filter(Boolean);
    const cards = routes.map(r => ({ r, s: routeStats(ctx.store, r) })).sort((a, b) => (a.s.ratio ?? 99) - (b.s.ratio ?? 99));
    return {
      title: 'Deals', screen: 'deals',
      html: '<section class="page"><p class="eyebrow">Fares you are watching</p><h1>Deals board</h1><p class="lede">Your own price log. Wanderlust does not fetch fares; it opens prefilled searches and keeps what you find. A route turns green when your latest fare is at or below your target.</p>' +
        '<ul class="deal-cards">' + (cards.map(({ r, s }) => '<li class="deal' + (s.good ? ' good' : '') + '"><h2>' + esc(r.replace('-', ' → ')) + '</h2><p class="big">' + (s.latest ? money(+s.latest.price, s.latest.currency) : '—') + '</p><p class="muted small">' + (s.latest ? 'Seen ' + esc(prettyDate(s.latest.seenOn)) + (s.latest.airline ? ' · ' + esc(s.latest.airline) : '') : 'No fares logged') + '</p><p class="small">Target: ' + (s.target ? money(+s.target.price, s.target.currency) : 'not set') + (s.lowest ? ' · lowest seen ' + money(+s.lowest.price, s.lowest.currency) : '') + '</p>' + spark(s.log) + (s.good ? '<p class="pill visited">At or below target</p>' : '') + (s.latest?.url ? ext(s.latest.url, 'Where you saw it') : '') + '</li>').join('') || '<li class="muted">No routes yet. Log a fare below, or open a trip’s Route tab for prefilled searches.</li>') + '</ul>' +
        '<div class="overview-grid"><form class="panel grid-form" data-form="fareLog"><h2 class="wide">Log a fare</h2>' + field(['route', 'Route (e.g. MEL-KEF)'], ctx.route.query.route || '', { required: true }) + field(['price', 'Price', 'money'], '', { required: true }) + field(['currency', 'Currency', 'select', ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD']], 'AUD') + field(['seenOn', 'Seen on', 'date'], todayISO()) + field(['travelDates', 'Travel dates']) + field(['airline', 'Airline']) + field(['url', 'Source link', 'url']) + '<div class="wide row end"><button class="btn primary">Save fare</button></div></form>' +
        '<form class="panel grid-form" data-form="fareTarget"><h2 class="wide">Set a target</h2>' + field(['route', 'Route'], ctx.route.query.route || '', { required: true }) + field(['price', 'Target price', 'money'], '', { required: true }) + field(['currency', 'Currency', 'select', ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD']], 'AUD') + '<div class="wide row end"><button class="btn">Save target</button></div></form></div></section>',
    };
  },
};
const clean = r => String(r).toUpperCase().replace(/\s*(→|TO|>)\s*/g, '-').replace(/[^A-Z-]/g, '');
export const forms = {
  async fareLog(f, ctx) { const v = formValues(f), route = clean(v.route); if (!/^[A-Z]{3}-[A-Z]{3}$/.test(route)) throw new Error('Use airport codes like MEL-KEF.'); if (v.url && !/^https:\/\//.test(v.url)) throw new Error('Use an https:// link.'); await ctx.store.create('fares', { id: newId('fare'), trip: '', route, price: String(v.price), currency: v.currency, seenOn: v.seenOn, travelDates: v.travelDates, airline: v.airline, url: v.url }); f.reset(); toast('Fare logged'); },
  async fareTarget(f, ctx) { const v = formValues(f), route = clean(v.route); if (!/^[A-Z]{3}-[A-Z]{3}$/.test(route)) throw new Error('Use airport codes like MEL-KEF.'); const ex = ctx.store.list('fareTargets').find(t => t.route === route); if (ex) await ctx.store.patch('fareTargets', ex.id, { price: String(v.price), currency: v.currency }); else await ctx.store.create('fareTargets', { id: newId('target'), trip: '', route, price: String(v.price), currency: v.currency }); toast('Target saved'); },
};
export const actions = {};

// Deals board: routes you watch, your logged fares and targets. Green means your latest fare is at or below target.
import { esc, icon, field, formValues, toast, ext } from '../kit.js';
import { newId } from '../../core/store.js';
import { money, prettyDate, todayISO } from '../../core/domain.js';
import { routeStats, fareLinks, isWatch } from '../../core/fares.js';
function spark(log) {
  if (log.length < 2) return '';
  const v = log.map(f => +f.price), lo = Math.min(...v), hi = Math.max(...v), w = 160, h = 36;
  const pts = v.map((p, i) => (i / (v.length - 1) * w).toFixed(1) + ',' + (hi === lo ? h / 2 : h - (p - lo) / (hi - lo) * h).toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Price history, ' + v.length + ' fares"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
}
let last = null, busy = false;
function searchPanel(ctx) {
  const n = ctx.store.list('fareTargets').filter(isWatch).length;
  const head = '<div class="panel search-deals"><div class="row between wrap"><div><h2>Search flight deals</h2><p class="muted small">' + (n ? 'Checks Google Flights now for your ' + n + ' watched route' + (n > 1 ? 's' : '') + '. Each route is searched at most once an hour.' : 'Watch a route first: set a target below and tick “Check it automatically”.') + '</p></div><button class="btn primary" data-act="searchDeals"' + (busy || !n ? ' disabled' : '') + '>' + (busy ? 'Searching…' : icon('search') + ' Search flight deals') + '</button></div>';
  if (!last) return head + '</div>';
  if (last.error) return head + '<p class="notice">' + esc(last.error) + '</p></div>';
  const KIND = { target: 'At or under target', drop: 'Price drop', rise: 'Price up', low: 'Google says low' };
  return head + '<ul class="plain search-results">' + last.results.map(r => '<li><b>' + esc(r.route.replace('-', ' → ')) + '</b> ' + (r.error ? '<span class="muted">' + esc(r.error) + '</span>' : money(+r.price, r.currency) + (r.airline ? ' <span class="muted small">' + esc(r.airline) + '</span>' : '') + (r.alerts || []).map(a => ' <span class="pill ' + (a.kind === 'rise' ? 'hold' : 'visited') + '" title="' + esc(a.body) + '">' + esc(KIND[a.kind] || a.kind) + '</span>').join('')) + '</li>').join('') + '</ul><p class="muted small">' + (last.searched ? 'Searched ' + last.searched + ' of ' + last.watched + '. ' : 'Nothing new to search. ') + (last.skippedRecent ? last.skippedRecent + ' searched in the last hour, so skipped. ' : '') + (last.skippedCap ? last.skippedCap + ' skipped: this month’s search allowance is used up. ' : '') + last.used + ' of ' + last.cap + ' searches used this month.</p></div>';
}
const LEVEL = { low: 'Google rates it low', typical: 'Google rates it typical', high: 'Google rates it high' };
function watchLine(s) {
  const t = s.target; if (!isWatch(t)) return '';
  const auto = s.log.filter(f => f.watch === t.id).at(-1);
  return '<p class="small watch-line">' + icon('bell') + ' Watching ' + esc(t.outDate) + (t.backDate ? ' – ' + esc(t.backDate) : ' one way') + ' · ' + esc(t.adults || '1') + ' traveller' + (+t.adults > 1 ? 's' : '') + (auto ? ' · checked ' + esc(prettyDate(auto.seenOn)) + (auto.level ? ' · ' + esc(LEVEL[auto.level] || auto.level) : '') + (auto.typical ? ' (typical ' + esc(auto.typical) + ')' : '') : ' · not searched yet') + ' <button class="linkish" data-act="watchOff" data-id="' + esc(t.id) + '">Stop watching</button></p>';
}
function linksFor(r, t) {
  const [a, b] = r.split('-'), ls = fareLinks(a, b, t?.outDate || '', t?.backDate || '', +(t?.adults || 1));
  return ls.length ? '<p class="small row wrap">' + ls.map(l => '<a class="btn small ghost" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' ' + icon('external') + '</a>').join('') + '</p>' : '';
}
export const view = {
  render(ctx) {
    const routes = [...new Set([...ctx.store.list('fares').map(f => f.route), ...ctx.store.list('fareTargets').map(t => t.route)])].filter(Boolean);
    const cards = routes.map(r => ({ r, s: routeStats(ctx.store, r) })).sort((a, b) => (a.s.ratio ?? 99) - (b.s.ratio ?? 99));
    const auto = ctx.route.query.search === '1';
    return {
      title: 'Deals', screen: 'deals', mount: auto ? () => { history.replaceState(history.state, '', '/deals'); if (!busy && ctx.store.list('fareTargets').some(isWatch)) actions.searchDeals(null, ctx); } : undefined,
      html: '<section class="page"><p class="eyebrow">Fares you are watching</p><h1>Deals board</h1><p class="lede">Your price log, plus a live Google Flights search for the routes you watch whenever you press the button. It tells you when a fare reaches your target, drops, jumps, or Google rates it low. A route turns green when its latest fare is at or below your target.</p>' + searchPanel(ctx) + '' +
        '<ul class="deal-cards">' + (cards.map(({ r, s }) => '<li class="deal' + (s.good ? ' good' : '') + '"><h2>' + esc(r.replace('-', ' → ')) + '</h2><p class="big">' + (s.latest ? money(+s.latest.price, s.latest.currency) : '—') + '</p><p class="muted small">' + (s.latest ? 'Seen ' + esc(prettyDate(s.latest.seenOn)) + (s.latest.airline ? ' · ' + esc(s.latest.airline) : '') : 'No fares logged') + '</p><p class="small">Target: ' + (s.target ? money(+s.target.price, s.target.currency) : 'not set') + (s.lowest ? ' · lowest seen ' + money(+s.lowest.price, s.lowest.currency) : '') + '</p>' + watchLine(s) + linksFor(r, s.target) + spark(s.log) + (s.good ? '<p class="pill visited">At or below target</p>' : '') + (s.latest?.url ? ext(s.latest.url, 'Where you saw it') : '') + '</li>').join('') || '<li class="muted">No routes yet. Log a fare below, or open a trip’s Route tab for prefilled searches.</li>') + '</ul>' +
        '<div class="overview-grid"><form class="panel grid-form" data-form="fareLog"><h2 class="wide">Log a fare</h2>' + field(['route', 'Route (e.g. MEL-KEF)'], ctx.route.query.route || '', { required: true }) + field(['price', 'Price', 'money'], '', { required: true }) + field(['currency', 'Currency', 'select', ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD']], 'AUD') + field(['seenOn', 'Seen on', 'date'], todayISO()) + field(['travelDates', 'Travel dates']) + field(['airline', 'Airline']) + field(['url', 'Source link', 'url']) + '<div class="wide row end"><button class="btn primary">Save fare</button></div></form>' +
        '<form class="panel grid-form" data-form="fareTarget"><h2 class="wide">Set a target</h2>' + field(['route', 'Route'], ctx.route.query.route || '', { required: true }) + field(['price', 'Target price', 'money'], '', { required: true }) + field(['currency', 'Currency', 'select', ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD']], 'AUD') + '<fieldset class="wide watch-set"><legend>Check it automatically</legend><label class="check"><input type="checkbox" name="auto" value="yes"> Check Google Flights every morning and alert me</label>' + field(['outDate', 'Flying out', 'date']) + field(['backDate', 'Flying back (blank for one way)', 'date']) + field(['adults', 'Travellers', 'number', [1, 9]], '1') + '<p class="muted small wide">Prices are for all travellers, in AUD. Searched when you press Search flight deals; capped well inside the free plan.</p></fieldset><div class="wide row end"><button class="btn">Save target</button></div></form></div></section>',
    };
  },
};
const clean = r => String(r).toUpperCase().replace(/\s*(→|TO|>)\s*/g, '-').replace(/[^A-Z-]/g, '');
export const forms = {
  async fareLog(f, ctx) { const v = formValues(f), route = clean(v.route); if (!/^[A-Z]{3}-[A-Z]{3}$/.test(route)) throw new Error('Use airport codes like MEL-KEF.'); if (v.url && !/^https:\/\//.test(v.url)) throw new Error('Use an https:// link.'); await ctx.store.create('fares', { id: newId('fare'), trip: '', route, price: String(v.price), currency: v.currency, seenOn: v.seenOn, travelDates: v.travelDates, airline: v.airline, url: v.url }); f.reset(); toast('Fare logged'); },
  async fareTarget(f, ctx) { const v = formValues(f), route = clean(v.route); if (!/^[A-Z]{3}-[A-Z]{3}$/.test(route)) throw new Error('Use airport codes like MEL-KEF.'); const auto = f.auto?.checked ? 'yes' : '', w = { auto, outDate: v.outDate || '', backDate: v.backDate || '', adults: String(v.adults || 1) };
    if (auto && !w.outDate) throw new Error('Add the date you fly out, so the automatic check knows what to search.');
    if (w.backDate && w.backDate < w.outDate) throw new Error('The return date is before the outbound date.');
    const ex = ctx.store.list('fareTargets').find(t => t.route === route); if (ex) await ctx.store.patch('fareTargets', ex.id, { price: String(v.price), currency: v.currency, ...w }); else await ctx.store.create('fareTargets', { id: newId('target'), trip: '', route, price: String(v.price), currency: v.currency, ...w }); toast('Target saved'); },
};
export const actions = {
  async searchDeals(el, ctx) {
    if (!navigator.onLine) { toast('Searching needs a connection.'); return; }
    busy = true; ctx.rerender();
    try {
      const r = await fetch('/fares/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const body = await r.json().catch(() => null);
      if (!r.ok || !body) last = { error: body?.error || (r.status === 404 ? 'Flight search runs on your live site, not in this preview.' : 'The search did not finish (' + r.status + '). Try again shortly.') };
      else { last = body; await ctx.sync?.run('fare-search'); const hits = body.results.flatMap(x => x.alerts || []); toast(hits.length ? hits[0].title + (hits.length > 1 ? ' (+' + (hits.length - 1) + ' more)' : '') : 'Prices updated. Nothing changed enough to flag.'); }
    } catch { last = { error: 'Could not reach your site. Check the connection and try again.' }; }
    busy = false; ctx.rerender();
  },
  async watchOff(el, ctx) { await ctx.store.patch('fareTargets', el.dataset.id, { auto: '' }); toast('Stopped watching. Your target and fares are kept.'); },
};

import { esc, icon, empty } from '../kit.js';
import { search } from '../../core/search.js';

export const view = {
  render(ctx) {
    const q = ctx.route.query.q || '', results = search(ctx.store, ctx.FORTY, q);
    const groups = {}; for (const r of results) (groups[r.group] ??= []).push(r);
    return {
      title: q ? 'Search: ' + q : 'Search', screen: 'search',
      html: '<section class="page narrow"><h1>Search everything</h1><form role="search" class="row" data-form="searchPage"><div class="field grow"><label for="sq">Places, journeys, bookings, documents, memories, research</label><input id="sq" name="q" type="search" value="' + esc(q) + '" autofocus autocomplete="off" data-input="searchLive"></div><button class="btn primary">Search</button></form>' +
        '<p class="muted small" role="status">' + (q ? results.length + ' result' + (results.length === 1 ? '' : 's') + ' on this device' : 'Search works offline: it looks through everything saved on this device.') + '</p>' +
        (q && !results.length ? empty('Nothing found.', 'Try a shorter word, a country, or a booking reference.') : Object.entries(groups).map(([g, rs]) => '<h2 class="group-title">' + esc(g) + '</h2><ul class="rows">' + rs.map(r => '<li><a class="row-item" href="' + esc(r.href) + '"><span><strong>' + esc(r.title) + '</strong><small>' + esc(r.sub) + '</small></span>' + icon('arrow') + '</a></li>').join('') + '</ul>').join('')) + '</section>',
    };
  },
};
let t;
export const actions = { searchLive(el, ctx) { clearTimeout(t); t = setTimeout(() => ctx.setQuery({ q: el.value }), 200); } };
export const forms = { searchPage(f, ctx) { ctx.setQuery({ q: f.q.value }); } };

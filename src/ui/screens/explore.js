import { esc, icon, photo, pill, statusTone, qs, empty, compass, coverId } from '../kit.js';
import { WISH, fortyModel } from '../../core/domain.js';
import { createMap } from '../map.js';
import { windowLabel } from '../../core/plan.js';
import { todayISO } from '../../core/domain.js';

export const PIN = s => s === 'Visited' ? '#2f6b52' : WISH.includes(s) ? '#b88c51' : s === 'Confirm visit' ? '#4f7a92' : '#8a958f';
const REGIONS = ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America', 'South Atlantic', 'Other'];
const STATUS_LABEL = s => s === 'Unconfirmed' ? 'To discover' : s;

export function filterPlaces(store, q) {
  const text = (q.q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return store.list('place').filter(p => (!text || [p.name, p.country, p.why, p.base, p.category, p.notes].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(text)) && (!q.region || p.region === q.region) && (!q.kind || p.category === q.kind) && (!q.status || (q.status === 'wish' ? WISH.includes(p.status) : p.status === q.status)));
}

function card(p, ctx) {
  const ph = ctx.PHOTOS[p.id];
  return '<li><a class="card" href="/place/' + esc(p.id) + '">' + (ph ? photo(ctx.PHOTOS, p.id, { cls: 'card-photo' }) : '<div class="card-photo drawn" aria-hidden="true">' + compass + '<span>' + Math.abs(p.lat).toFixed(1) + '°' + (p.lat < 0 ? 'S' : 'N') + ' ' + Math.abs(p.lon).toFixed(1) + '°' + (p.lon < 0 ? 'W' : 'E') + '</span></div>') +
    '<div class="card-body"><p class="eyebrow">' + esc(p.country) + '</p><h3>' + esc(p.name) + '</h3><p>' + esc(p.why || '') + '</p><div class="card-foot">' + pill(STATUS_LABEL(p.status || 'Unconfirmed'), statusTone(p.status)) + '<span class="muted">' + (p.researchOutline ? 'Duration to research' : esc(p.nights) + ' suggested nights') + '</span></div></div></a></li>';
}
const row = p => '<li><a class="row-item" href="/place/' + esc(p.id) + '"><span class="dot" style="background:' + PIN(p.status) + '"></span><span><strong>' + esc(p.name) + '</strong><small>' + esc(p.country) + ' · ' + esc(STATUS_LABEL(p.status || 'Unconfirmed')) + '</small></span>' + icon('arrow') + '</a></li>';

const daysTo = t => Math.max(0, Math.round((new Date(t.windowStart + '-01') - new Date(todayISO())) / 864e5));
const bg = (ctx, id) => ctx.PHOTOS[id] ? ' style="--img:url(' + esc(ctx.PHOTOS[id].src) + ')"' : '';
// The home dashboard: big photographic doorways into each part of the app, then the trips coming up.
function dashboard(ctx, f, planTrips, upNext, visited) {
  const ring = (f.done / 40 * 100).toFixed(1), mosaic = f.selection.map(id => f.entries.find(e => e.id === id)).filter(Boolean);
  const deals = ctx.store.list('fareTargets').length, fortyDoneIds = new Set(mosaic.filter(e => f.place(e)?.status === 'Visited').map(e => e.id));
  const tile = (href, cls, img, eyebrow, title, body) => '<li class="reveal"><a class="door ' + cls + '" href="' + href + '"' + img + '><span class="door-in"><span class="eyebrow">' + eyebrow + '</span><strong>' + title + '</strong>' + (body ? '<span class="door-body">' + body + '</span>' : '') + '</span>' + icon('arrow') + '</a></li>';
  return '<section class="page wide dash"><div class="section-head reveal"><div><p class="eyebrow">Where to next</p><h2>Your world, <em>at a glance.</em></h2></div></div><ul class="doors">' +
    (upNext ? tile('/journeys/' + upNext.id, 'big', bg(ctx, coverId(ctx, upNext)), 'Next adventure · ' + esc(windowLabel(upNext.windowStart, upNext.windowEnd)), esc(upNext.name.replace(/^.*?: /, '')), esc(upNext.scope || '')) : '') +
    '<li class="reveal"><a class="door forty-door" href="/forty"><span class="door-in"><span class="eyebrow">The forty</span><strong><span data-count="' + f.done + '">' + f.done + '</span> of 40</strong><span class="mini-mosaic" aria-hidden="true">' + mosaic.map(e => '<i class="' + (fortyDoneIds.has(e.id) ? 'done' : '') + '"' + bg(ctx, e.photoId) + '></i>').join('') + '</span></span>' + icon('arrow') + '</a></li>' +
    tile('/plan', 'plan-door', '', 'Your plan', planTrips.length ? planTrips.length + ' trips planned' : 'Plan your next trips', '<span class="mini-bars" aria-hidden="true">' + planTrips.map(t => '<i style="--x:' + ((+t.windowStart.slice(0, 4) - 2026) * 12 + +t.windowStart.slice(5, 7) - 11) / 66 * 100 + '%"></i>').join('') + '</span>') +
    tile('/story', 'story-door', bg(ctx, 'd029'), 'Travel story', visited + ' countries', 'And every memory you keep') +
    tile('/today', 'today-door', '', 'Today', 'Your day, offline', 'Plans, bookings, contacts') +
    tile('/deals', 'deals-door', '', 'Deals board', deals ? deals + ' routes watched' : 'Watch fares', 'Green means book it') + '</ul>' +
    (planTrips.length ? '<div class="section-head reveal"><div><p class="eyebrow">Coming up</p><h2>The road <em>ahead.</em></h2></div><a class="btn ghost" href="/journeys">All journeys ' + icon('arrow') + '</a></div><ul class="rail" aria-label="Trips in order">' + planTrips.map((t, i) => { const partner = ctx.store.records('segments', t.id).filter(l => l.option.startsWith('Partner')); return '<li class="reveal"><a class="rail-card" href="/journeys/' + esc(t.id) + '"' + bg(ctx, coverId(ctx, t)) + '><span class="rail-n">' + String(i + 1).padStart(2, '0') + '</span><span class="rail-in"><span class="eyebrow">' + esc(windowLabel(t.windowStart, t.windowEnd)) + '</span><strong>' + esc(t.name.replace(/^.*?: /, '')) + '</strong><span class="rail-meta">' + esc(t.lengthNote || '') + (partner.length ? ' · Partner ' + partner.map(l => l.partner).join('/') : '') + '</span></span></a></li>'; }).join('') + '</ul>' : '') + '</section>';
}

export const home = {
  render(ctx) {
    const { store, route } = ctx, q = route.query, view = q.view || 'map';
    const places = store.list('place'), list = filterPlaces(store, q);
    const countries = store.list('country'), visited = countries.filter(c => c.status === 'Visited').length, limited = countries.filter(c => c.status === 'Limited visit').length;
    const f = fortyModel(store, ctx.FORTY);
    const scene = ctx.SCENES[(new Date().getDate()) % ctx.SCENES.length];
    const nextTrip = store.list('trip').filter(t => ['Booked', 'Planning', 'Researching'].includes(t.status)).sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'))[0];
    const planTrips = store.list('trip').filter(t => t.planId && t.windowStart).sort((a, b) => a.windowStart.localeCompare(b.windowStart));
    const upNext = planTrips.find(t => (t.windowEnd || t.windowStart) >= todayISO().slice(0, 7));
    const kinds = [...new Set(places.map(p => p.category).filter(Boolean))].sort();
    const shown = Math.max(24, +q.show || 24);
    const filters = '<form class="filters" data-form="noop" data-live="1" aria-label="Filter places"><div class="field grow"><label for="eq">Search the atlas</label><input id="eq" type="search" name="q" value="' + esc(q.q || '') + '" placeholder="A place, a country, a feeling…" data-change="exploreFilter" data-input="exploreFilter"></div>' +
      '<div class="field"><label for="er">Continent</label><select id="er" name="region" data-change="exploreFilter"><option value="">All</option>' + REGIONS.map(r => '<option' + (q.region === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="ek">Kind of place</label><select id="ek" name="kind" data-change="exploreFilter"><option value="">Every kind</option>' + kinds.map(k => '<option' + (q.kind === k ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="es">Your status</label><select id="es" name="status" data-change="exploreFilter"><option value="">Any</option><option value="wish"' + (q.status === 'wish' ? ' selected' : '') + '>On your wishlist</option>' + ['Visited', 'Confirm visit', 'Unconfirmed'].map(s => '<option value="' + s + '"' + (q.status === s ? ' selected' : '') + '>' + STATUS_LABEL(s) + '</option>').join('') + '</select></div>' +
      '<div class="seg" role="group" aria-label="View">' + [['map', 'Map', 'map'], ['cards', 'Cards', 'grid'], ['list', 'List', 'list']].map(([v, l, i]) => '<a href="/' + qs({ ...q, view: v === 'map' ? '' : v, show: '' }) + '"' + (view === v ? ' aria-current="true"' : '') + '>' + icon(i) + '<span>' + l + '</span></a>').join('') + '</div></form>';
    let body;
    if (!list.length) body = empty('No places match those filters.', 'There is a whole world beyond this filter. Clear a filter or add a place you love.', '<a class="btn" href="/">Clear filters</a>');
    else if (view === 'map') body = '<div class="split"><div class="mapwrap"><div id="exploreMap" class="map"></div><p class="map-key"><span class="dot" style="background:#2f6b52"></span>Visited <span class="dot" style="background:#b88c51"></span>Wishlist <span class="dot" style="background:#4f7a92"></span>Confirm visit <span class="dot" style="background:#8a958f"></span>To discover · Pins mark approximate regions.</p></div><div class="side-list"><p class="muted">' + list.length + ' places</p><ul class="rows">' + list.slice(0, 80).map(row).join('') + '</ul>' + (list.length > 80 ? '<a class="btn ghost" href="/' + qs({ ...q, view: 'list' }) + '">See all ' + list.length + '</a>' : '') + '</div></div>';
    else if (view === 'cards') body = '<ul class="cards">' + list.slice(0, shown).map(p => card(p, ctx)).join('') + '</ul>' + (list.length > shown ? '<p class="center"><a class="btn" href="/' + qs({ ...q, show: shown + 24 }) + '">Show more places</a></p>' : '');
    else body = '<ul class="rows two-col">' + list.map(row).join('') + '</ul>';
    return {
      title: 'Explore', screen: 'explore',
      html: '<section class="hero carousel" data-carousel>' + ctx.SCENES.map((s, i) => '<img class="slide' + (s === scene ? ' active' : '') + '" src="' + esc(s.src) + '" alt="' + esc(s.alt) + '"' + (s === scene ? ' fetchpriority="high"' : ' loading="lazy"') + ' width="1800" height="1200" data-place="' + esc(s.place + ' · ' + (s.credit || '')) + '">').join('') + '<div class="hero-in"><p class="eyebrow">For the places that stay with you</p><h1>There’s a whole world <em>waiting.</em></h1>' +
        (upNext ? '<a class="countdown" href="/journeys/' + esc(upNext.id) + '"><span class="cd-num" data-count="' + daysTo(upNext) + '">' + daysTo(upNext) + '</span><span class="cd-text">days until <b>' + esc(upNext.name.replace(/^.*?: /, '')) + '</b><small>' + esc(windowLabel(upNext.windowStart, upNext.windowEnd)) + ' · target window</small></span></a>' : '') +
        '<dl class="stats"><div><dt>Countries &amp; territories</dt><dd><span data-count="' + visited + '">' + visited + '</span>' + (limited ? '<small> + ' + limited + ' limited</small>' : '') + '</dd></div><div><dt>Places in your atlas</dt><dd><span data-count="' + places.length + '">' + places.length + '</span></dd></div><div><dt>On your wishlist</dt><dd><span data-count="' + places.filter(p => WISH.includes(p.status)).length + '">' + places.filter(p => WISH.includes(p.status)).length + '</span></dd></div><div><dt>The forty</dt><dd><span data-count="' + f.done + '">' + f.done + '</span><small> / 40</small></dd></div></dl>' +
        '<div class="row">' + (nextTrip ? '<a class="btn gold" href="/journeys/' + esc(nextTrip.id) + '">Continue: ' + esc(nextTrip.name) + ' ' + icon('arrow') + '</a>' : '<a class="btn gold" href="/forty">Your forty ' + icon('arrow') + '</a>') + '<a class="btn on-dark" href="/place/new">' + icon('plus') + ' Add a place</a></div></div><p class="hero-credit" data-credit>' + esc(scene.place) + ' · ' + esc(scene.credit || '') + '</p><div class="dots" role="group" aria-label="Choose a landscape">' + ctx.SCENES.map((s, i) => '<button class="dot-btn' + (s === scene ? ' on' : '') + '" data-slide="' + i + '" aria-label="Show ' + esc(s.place) + '"' + (s === scene ? ' aria-pressed="true"' : ' aria-pressed="false"') + '></button>').join('') + '</div></section>' +
        dashboard(ctx, f, planTrips, upNext, visited) +
        '<section class="page wide"><div class="section-head"><div><p class="eyebrow">Your personal world atlas</p><h2>Every pin, <em>a possibility.</em></h2></div></div>' + filters + body + '</section>',
      async mount(root) {
        const el = root.querySelector('#exploreMap'); if (!el) return;
        try {
          const m = await createMap(el, { assetBase: ctx.A, store, label: 'World map of your atlas' });
          ctx.cleanups.push(() => m.destroy());
          await m.setPins(list.map(p => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, color: PIN(p.status) })), id => ctx.nav('/place/' + id));
          if (q.region || q.q) m.fit(list);
        } catch (e) { el.innerHTML = '<p class="map-fail">The map could not start on this device (' + esc(e.message) + '). The list shows every place.</p>'; }
      },
    };
  },
};

let filterTimer;
export const actions = {
  exploreFilter(el, ctx, e) {
    const apply = () => ctx.setQuery({ [el.name]: el.value, show: '' });
    if (e?.type === 'input') { clearTimeout(filterTimer); filterTimer = setTimeout(apply, 250); } else apply();
  },
};
export const forms = { noop() {} };

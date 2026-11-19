import { esc, icon, photo, pill, statusTone, field, formValues, qs, empty, compass, toast, confirmDialog } from '../kit.js';
import { fortyModel, prettyDate, todayISO } from '../../core/domain.js';
import { PLACE_STATUSES } from '../../core/model.js';
import { newId } from '../../core/store.js';
import { bestFor, windowLabel } from '../../core/plan.js';
import { ext } from '../kit.js';
import { createMap } from '../map.js';

const GROUPS = [['core', 'The forty'], ['optional', 'Optional'], ['completed', 'Already experienced'], ['conditional', 'Conditional reserves']];
const PIN = (e, p) => e.conditional ? '#8f6f4a' : p?.status === 'Visited' ? '#2f6b52' : '#b88c51';
const REGIONS = ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America', 'South Atlantic'];

function filtered(ctx, f) {
  const q = ctx.route.query, group = q.group || 'core', text = (q.q || '').toLowerCase();
  return f.entries.filter(e => f.groupOf(e) === group).filter(e => {
    const p = f.place(e), pe = f.personal(e);
    return (!q.region || p?.region === q.region) && (!q.kind || p?.category === q.kind) && (!q.year || String(pe.plannedYear || '') === q.year) && (!q.priority || pe.priority === q.priority) && (!q.trip || pe.tripId === q.trip) && (!text || [e.name, e.country, e.experience, pe.memory, pe.notes].join(' ').toLowerCase().includes(text));
  }).sort((a, b) => group === 'core' ? (q.sort === 'year' ? (f.personal(a).plannedYear || 9999) - (f.personal(b).plannedYear || 9999) : q.sort === 'priority' ? ['High', 'Medium', 'Low', undefined].indexOf(f.personal(a).priority) - ['High', 'Medium', 'Low', undefined].indexOf(f.personal(b).priority) : f.slot(a) - f.slot(b)) : a.name.localeCompare(b.name));
}

function badges(e, p, pe, f, tripName = '') {
  return [tripName ? pill(tripName.replace(/^.*?: /, '')) : '', pill(p?.status === 'Unconfirmed' || !p?.status ? 'To discover' : p.status, statusTone(p?.status)), e.conditional ? pill('Conditional · check current advice', 'hold') : '', e.historyUnconfirmed && p?.status !== 'Visited' ? pill('Visit history to confirm') : '', e.needsResearch ? pill('Research outline') : '', pe.plannedYear ? pill('Planned ' + pe.plannedYear) : '', pe.priority ? pill(pe.priority + ' priority') : ''].join('');
}

export const list = {
  render(ctx) {
    const f = fortyModel(ctx.store, ctx.FORTY), q = ctx.route.query, view = q.view || 'cards', group = q.group || 'core';
    const entries = filtered(ctx, f);
    const deadline = ctx.store.setting('fortyDeadline'), today = todayISO();
    const daysLeft = deadline ? Math.round((new Date(deadline) - new Date(today)) / 864e5) : null;
    const kinds = [...new Set(f.entries.map(e => f.place(e)?.category).filter(Boolean))].sort();
    const years = [...new Set(f.entries.map(e => f.personal(e).plannedYear).filter(Boolean))].sort();
    const trips = ctx.store.list('trip');
    const pct = Math.round(f.done / 40 * 100);
    const cards = entries.map(e => {
      const p = f.place(e), pe = f.personal(e), n = f.slot(e);
      return '<li><a class="forty-card" href="/forty/' + esc(e.id) + '">' + (ctx.PHOTOS[e.photoId] ? photo(ctx.PHOTOS, e.photoId, { cls: 'card-photo' }) : '<div class="card-photo drawn">' + compass + (p ? '<p class="coord"><small>' + esc(e.country) + '</small>' + Math.abs(p.lat).toFixed(0) + '°' + (p.lat < 0 ? 'S' : 'N') + ' · ' + Math.abs(p.lon).toFixed(0) + '°' + (p.lon < 0 ? 'W' : 'E') + '</p>' : '') + '</div>') + (n ? '<span class="slot" aria-label="Slot ' + n + '">' + String(n).padStart(2, '0') + '</span>' : '') + (e.illustrative && ctx.PHOTOS[e.photoId] ? '<span class="regional">Regional imagery</span>' : '') +
        '<div class="card-body"><p class="eyebrow">' + esc(e.country) + '</p><h3>' + esc(e.name) + '</h3><p>' + esc(e.experience) + '</p><div class="badges">' + badges(e, p, pe, f, trips.find(t => t.id === pe.tripId)?.name) + '</div></div></a></li>';
    }).join('');
    const rows = entries.map(e => { const p = f.place(e), pe = f.personal(e), n = f.slot(e); return '<tr><td>' + (n ? String(n).padStart(2, '0') : '—') + '</td><th scope="row"><a href="/forty/' + esc(e.id) + '">' + esc(e.name) + '</a><small>' + esc(e.country) + '</small></th><td>' + esc(p?.status || 'Unconfirmed') + (e.conditional ? ' · conditional' : '') + '</td><td>' + esc(pe.priority || '') + '</td><td>' + esc(pe.plannedYear || '') + '</td><td>' + esc(trips.find(t => t.id === pe.tripId)?.name || '') + '</td><td>' + esc(pe.completedOn ? prettyDate(pe.completedOn) : '') + '</td></tr>'; }).join('');
    const sel = (name, label, opts) => '<div class="field"><label for="ff-' + name + '">' + label + '</label><select id="ff-' + name + '" name="' + name + '" data-change="fortyFilter">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + ((q[name] || '') === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
    return {
      title: 'The forty', screen: 'forty',
      html: '<section class="forty-hero"><div class="page wide"><div class="forty-head"><div><p class="eyebrow">A lifetime of wonder. A chapter to begin now.</p><h1>Forty before <em>forty.</em></h1><p class="lede">Your chosen forty, from the farthest ice to the warmest sea. Numbers are tracking slots, not a ranking or a route.</p></div>' +
        '<ul class="forty-mosaic" aria-label="Your forty: visited places in colour">' + f.selection.map((id, k) => { const e = f.entries.find(x => x.id === id), p = e && f.place(e), ph = e && ctx.PHOTOS[e.photoId]; return e ? '<li class="' + (p?.status === 'Visited' ? 'done' : '') + '"><a href="/forty/' + esc(e.id) + '" title="' + esc(String(k + 1).padStart(2, '0') + ' · ' + e.name) + '"' + (ph ? ' style="--img:url(' + esc(ph.src) + ')"' : '') + '><span class="sr">' + esc(e.name) + (p?.status === 'Visited' ? ', visited' : '') + '</span><b aria-hidden="true">' + (k + 1) + '</b></a></li>' : ''; }).join('') + '</ul>' + '<div class="progress-ring" role="img" aria-label="' + f.done + ' of 40 core places marked visited"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52" stroke-dasharray="' + (pct * 3.267).toFixed(1) + ' 400"/></svg><div><strong data-count="' + f.done + '">' + f.done + '</strong><span>of 40 visited</span></div></div></div>' +
        '<p class="muted small">Begun in November 2026, at 34. ' + (deadline ? 'Your date: ' + esc(prettyDate(deadline)) + (daysLeft >= 0 ? ' · ' + daysLeft.toLocaleString('en-AU') + ' days to go' : '') + ' · <a href="/more/settings">Change</a>' : 'No target date set. <a href="/more/settings">Set one if you like</a>; Wanderlust will not guess it.') + '</p></div></section>' +
        '<section class="page wide"><nav class="seg big" aria-label="Collection">' + GROUPS.map(([k, l]) => '<a href="/forty' + qs({ ...q, group: k === 'core' ? '' : k }) + '"' + (group === k ? ' aria-current="true"' : '') + '>' + l + ' <span class="count">' + f.entries.filter(e => f.groupOf(e) === k).length + '</span></a>').join('') + '</nav>' +
        '<p class="muted">' + ({ core: 'Exactly forty. Substituting moves a place to Optional; nothing is deleted. Yellowstone, Komodo and Lençóis Maranhenses were added after the original visit-history check.', optional: 'Strong alternatives. Swap one in without losing the place it replaces.', completed: 'Confirmed visits. Specific activities and dates stay unconfirmed until you add them — for example, the Milford Track is not assumed.', conditional: 'Iran and Russia / the Trans-Siberian stay on hold under your only-when-safe condition. Petra and Wadi Rum keep their conditional flags in the forty.' })[group] + '</p>' +
        '<form class="filters" data-form="noop" data-live="1"><div class="field grow"><label for="ff-q">Search</label><input id="ff-q" name="q" type="search" value="' + esc(q.q || '') + '" placeholder="A place, country or feeling" data-input="fortyFilter" data-change="fortyFilter"></div>' + sel('region', 'Continent', [['', 'All'], ...REGIONS.map(r => [r, r])]) + sel('kind', 'Experience', [['', 'Every kind'], ...kinds.map(k => [k, k])]) +
        '<details class="more-filters"' + (q.priority || q.year || q.trip || q.sort ? ' open' : '') + '><summary>Priority, year, journey and order</summary><div>' + sel('priority', 'Priority', [['', 'Any'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']]) + sel('year', 'Planned year', [['', 'Any'], ...years.map(y => [y, y])]) + sel('trip', 'Journey', [['', 'Any'], ...trips.map(t => [t.id, t.name])]) + (group === 'core' ? sel('sort', 'Order', [['', 'Slot'], ['priority', 'Priority'], ['year', 'Planned year']]) : '') + '</div></details>' +
        '<div class="seg" role="group" aria-label="View">' + [['cards', 'Cards', 'grid'], ['list', 'List', 'list'], ['map', 'Map', 'map']].map(([v, l, i]) => '<a href="/forty' + qs({ ...q, view: v === 'cards' ? '' : v }) + '"' + (view === v ? ' aria-current="true"' : '') + '>' + icon(i) + '<span>' + l + '</span></a>').join('') + '</div></form>' +
        (!entries.length ? empty('Nothing matches.', 'Try another filter.') : view === 'map' ? '<div id="fortyMap" class="map tall"></div><p class="muted small">Pins are approximate regional positions, not trailheads or hotels.</p><ul class="rows two-col">' + entries.map(e => '<li><a class="row-item" href="/forty/' + esc(e.id) + '"><span class="dot" style="background:' + PIN(e, f.place(e)) + '"></span><span><strong>' + esc(e.name) + '</strong><small>' + esc(e.country) + '</small></span></a></li>').join('') + '</ul>' : view === 'list' ? '<div class="table-wrap"><table class="table"><thead><tr><th>Slot</th><th>Place</th><th>Status</th><th>Priority</th><th>Year</th><th>Journey</th><th>Completed</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<ul class="cards forty-cards">' + cards + '</ul>') +
        '<p class="row"><a class="btn ghost" href="/prepare/forty">' + icon('download') + ' Prepare the forty for offline</a><a class="btn ghost" href="/forty/new/swap?add=1">' + icon('plus') + ' Add an optional alternative</a></p></section>',
      async mount(root) {
        const el = root.querySelector('#fortyMap'); if (!el) return;
        try { const m = await createMap(el, { assetBase: ctx.A, store: ctx.store, label: 'Map of your forty' }); ctx.cleanups.push(() => m.destroy()); await m.setPins(entries.map(e => { const p = f.place(e); return p && { id: e.id, name: (f.slot(e) ? f.slot(e) + '. ' : '') + e.name, lat: p.lat, lon: p.lon, color: PIN(e, p), big: true }; }).filter(Boolean), id => ctx.nav('/forty/' + id)); }
        catch (e) { el.innerHTML = '<p class="map-fail">Map unavailable on this device. The list below has every place.</p>'; }
      },
    };
  },
};

export const entry = {
  render(ctx) {
    const f = fortyModel(ctx.store, ctx.FORTY), e = f.entries.find(x => x.id === ctx.route.params.id);
    if (!e) return { title: 'Not found', html: '<section class="page narrow"><h1>This entry is not in your collection.</h1><a class="btn" href="/forty">The forty</a></section>' };
    const p = f.place(e), pe = f.personal(e), g = f.groupOf(e), n = f.slot(e), trips = ctx.store.list('trip');
    return {
      title: e.name, screen: 'forty-entry',
      html: '<article class="place"><header class="place-hero">' + (ctx.PHOTOS[e.photoId] ? photo(ctx.PHOTOS, e.photoId, { eager: true, caption: true, illustrative: e.illustrative }) : '<div class="photo none drawn">' + compass + '</div>') + '<div class="place-title"><a class="back" href="/forty">' + icon('back') + ' The forty</a><p class="eyebrow">' + (g === 'core' ? 'Slot ' + n + ' of 40' : GROUPS.find(x => x[0] === g)[1]) + ' · ' + esc(e.country) + '</p><h1>' + esc(e.name) + '</h1><p class="lede">' + esc(e.experience) + '</p></div></header>' +
        '<div class="page place-grid"><div class="col-main">' + (pe.coverFile ? '<figure class="panel"><img class="att-img" data-file="' + esc(pe.coverFile) + '" alt="Your photo at ' + esc(e.name) + '"><figcaption class="muted small">Visited ' + esc(pe.completedOn ? prettyDate(pe.completedOn) : '') + '</figcaption></figure>' : '') +
        (e.conditional ? '<p class="notice hold">Conditional on travel advice and conditions. Listing it does not verify current safety, access, visas or transport.</p>' : '') +
        '<section class="panel"><h2>Travel status</h2><p class="muted">This is the visit status of the linked place, shared with your atlas. Completion of specific activities is never assumed.</p><div class="chips">' + PLACE_STATUSES.map(s => '<label class="chip"><input type="radio" name="st" value="' + s + '"' + ((p?.status || 'Unconfirmed') === s ? ' checked' : '') + ' data-change="fortyStatus" data-place="' + esc(e.placeId) + '"><span>' + (s === 'Unconfirmed' ? 'To discover' : s) + '</span></label>').join('') + '</div>' + (p ? '<p><a href="/place/' + esc(p.id) + '">Open the destination planner ' + icon('arrow') + '</a></p>' : '') + '</section>' +
        '<section class="panel"><h2>Make it yours</h2><form class="grid-form" data-form="fortyPersonal"><input type="hidden" name="id" value="' + esc(e.id) + '">' +
        field(['priority', 'Personal priority', 'select', [['', 'Not set'], 'High', 'Medium', 'Low']], pe.priority || '') + field(['plannedYear', 'Planned year', 'number', [2026, 2060]], pe.plannedYear ?? '') + field(['tripId', 'Group with journey', 'select', [['', 'Not grouped'], ...trips.map(t => [t.id, t.name])]], pe.tripId || '') + field(['completedOn', 'Completed on (if known)', 'date'], pe.completedOn || '') +
        field(['companions', 'Companion preferences', 'textarea'], pe.companions || '') + field(['alternatives', 'Alternatives you would accept', 'textarea'], pe.alternatives || '') + field(['memory', 'Memories', 'textarea'], pe.memory || '') +
        '<div class="wide row end"><button class="btn primary">Save</button></div></form></section>' +
        (() => { const b = bestFor(ctx.store, ctx.PLAN, e) || { months: [], note: '', source: '', checked: '' }, M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return '<section class="panel"><h2>Best months</h2><p class="muted small">' + (b.checked ? 'Checked ' + esc(prettyDate(b.checked)) + '.' : 'From the plan brief; not yet checked. Set them as you confirm them.') + ' Trips flag this place when they fall outside these months.</p><form class="grid-form" data-form="fortyBest"><input type="hidden" name="place" value="' + esc(e.placeId) + '"><fieldset class="wide"><legend>Months</legend><div class="chips">' + M.map((m, i) => '<label class="chip"><input type="checkbox" name="m' + (i + 1) + '"' + (b.months.includes(i + 1) ? ' checked' : '') + '><span>' + m + '</span></label>').join('') + '</div></fieldset>' +
            field(['note', 'Note (e.g. “late June to September”)'], b.note) + field(['source', 'Source link', 'url'], b.source && /^https:/.test(b.source) ? b.source : '') + field(['checked', 'Checked on', 'date'], b.checked) + '<div class="wide row end"><button class="btn">Save best months</button></div></form></section>'; })() + '</div>' +
        '<aside class="col-side">' + ((ctx.PLAN.officialLinks || {})[e.id] ? '<section class="links"><h2>Official links</h2>' + ctx.PLAN.officialLinks[e.id].map(l => ext(l.url, l.title) + '<p class="muted small">' + esc(l.authority) + ' · checked ' + esc(prettyDate(l.checked)) + '</p>').join('') + '</section>' : '') + (['core', 'optional'].includes(g) ? '<section class="panel"><h2>' + (g === 'core' ? 'Substitute' : 'Swap into the forty') + '</h2><p class="muted">' + (g === 'core' ? 'Replace this slot with an optional place. This place moves to Optional with all its notes.' : 'Choose a core place to move to Optional. Both keep their notes, itineraries and history.') + '</p><a class="btn" href="/forty/' + esc(e.id) + '/swap">' + icon('swap') + ' Choose a substitution</a></section>' : '') +
        (p ? '<section class="facts"><dl>' + (() => { const b = bestFor(ctx.store, ctx.PLAN, e), tr = trips.find(t => t.id === pe.tripId); return (b ? '<div><dt>Best months</dt><dd>' + esc(b.note) + (b.checked ? '' : '<br><small class="muted">From the plan brief; not yet checked against a source</small>') + '</dd></div>' : '') + (tr ? '<div><dt>Trip</dt><dd><a href="/journeys/' + esc(tr.id) + '">' + esc(tr.name) + '</a><br>' + esc(windowLabel(tr.windowStart, tr.windowEnd)) + '</dd></div>' : ''); })() + '<div><dt>Season notes</dt><dd>' + esc(p.season || 'To research') + '</dd></div><div><dt>Map position</dt><dd>Approximate regional marker only.</dd></div></dl></section>' : '') + '</aside></div></article>',
    };
  },
};

export const swap = {
  render(ctx) {
    const f = fortyModel(ctx.store, ctx.FORTY), q = ctx.route.query;
    if (ctx.route.params.id === 'new') {
      const linked = new Set(f.entries.map(e => e.placeId));
      return { title: 'Add an alternative', html: '<section class="page narrow"><a class="back" href="/forty?group=optional">' + icon('back') + ' Optional places</a><h1>Add an optional alternative</h1><p class="lede">It joins Optional places. You can then swap it into the forty.</p><form class="grid-form" data-form="fortyExtra">' + field(['placeId', 'Place from your atlas', 'select', ctx.store.list('place').filter(p => !linked.has(p.id)).map(p => [p.id, p.name + ' — ' + p.country])], '', { required: true }) + field(['experience', 'The experience you want', 'textarea'], '') + '<div class="wide row end"><button class="btn primary">Add to optional</button></div></form><p class="muted small">Not in the list? <a href="/place/new">Add the place to your atlas</a> first.</p></section>' };
    }
    const e = f.entries.find(x => x.id === ctx.route.params.id); if (!e) return { title: 'Not found', html: '<section class="page narrow"><h1>Not found</h1></section>' };
    const isCore = f.groupOf(e) === 'core', candidates = f.entries.filter(x => f.groupOf(x) === (isCore ? 'optional' : 'core')).sort((a, b) => isCore ? a.name.localeCompare(b.name) : f.slot(a) - f.slot(b));
    return {
      title: 'Substitute ' + e.name,
      html: '<section class="page narrow"><a class="back" href="/forty/' + esc(e.id) + '">' + icon('back') + ' ' + esc(e.name) + '</a><h1>' + (isCore ? 'Find an alternative to ' : 'Make room for ') + esc(e.name) + '</h1><p class="lede">' + (isCore ? 'The place you choose takes slot ' + f.slot(e) + '. ' + esc(e.name) + ' moves to Optional.' : esc(e.name) + ' takes the slot you choose. The displaced place moves to Optional.') + ' The forty stays at exactly forty, and every place keeps its notes, itinerary and history.</p>' +
        '<form data-form="fortySwap"><input type="hidden" name="entry" value="' + esc(e.id) + '"><fieldset><legend>' + (isCore ? 'Optional place to bring in' : 'Core place to move to Optional') + '</legend><ul class="choice-list">' + candidates.map(c => '<li><label class="choice"><input type="radio" name="other" value="' + esc(c.id) + '" required><span>' + (isCore ? '' : '<b>' + String(f.slot(c)).padStart(2, '0') + '</b> ') + '<strong>' + esc(c.name) + '</strong><small>' + esc(c.country) + ' · ' + esc(c.experience) + '</small></span></label></li>').join('') + '</ul></fieldset>' + (!candidates.length ? '<p class="muted">No optional places yet. <a href="/forty/new/swap">Add one</a>.</p>' : '') + '<div class="row end"><a class="btn ghost" href="/forty/' + esc(e.id) + '">Cancel</a><button class="btn primary">Save substitution</button></div></form></section>',
    };
  },
};

export const actions = {
  fortyFilter(el, ctx, e) { const apply = () => ctx.setQuery({ [el.name]: el.value }); if (e?.type === 'input') { clearTimeout(actions._t); actions._t = setTimeout(apply, 250); } else apply(); },
  async fortyStatus(el, ctx) { await ctx.store.patch('place', el.dataset.place, { status: el.value }); toast('Status saved'); },
};
export const forms = {
  async fortyBest(f, ctx) {
    const v = formValues(f), months = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => v['m' + m]);
    if (v.source && !/^https:\/\//.test(v.source)) throw new Error('Use an https:// link for the source.');
    if (v.checked && v.checked > todayISO()) throw new Error('A checked date cannot be in the future.');
    await ctx.store.patch('place', v.place, { bestMonths: { months, note: v.note || (months.length === 12 ? 'Year-round' : ''), source: v.source || '', checked: v.checked || '' } });
    toast('Best months saved. Trip season checks are updated.');
  },
  async fortyPersonal(f, ctx) {
    const v = formValues(f), id = v.id; delete v.id;
    for (const k of Object.keys(v)) if (v[k] === '' ) v[k] = null;
    if (v.completedOn && v.completedOn > todayISO()) throw new Error('A completion date cannot be in the future.');
    if (ctx.store.get('fortyEntry', id)) await ctx.store.patch('fortyEntry', id, v); else await ctx.store.create('fortyEntry', v, undefined, id);
    toast('Saved on this device');
  },
  async fortySwap(f, ctx) {
    const v = formValues(f), m = fortyModel(ctx.store, ctx.FORTY), e = m.entries.find(x => x.id === v.entry), isCore = m.groupOf(e) === 'core';
    if (!v.other) throw new Error('Choose a place.');
    const out = isCore ? e.id : v.other, inn = isCore ? v.other : e.id;
    const outE = m.entries.find(x => x.id === out), inE = m.entries.find(x => x.id === inn);
    if (!await confirmDialog('Swap ' + outE.name + ' for ' + inE.name + '?', { ok: 'Save substitution', detail: outE.name + ' moves to Optional with everything you saved. Your forty stays at forty.' })) return;
    await ctx.store.swap(out, inn); ctx.nav('/forty', { replace: true }); toast('Your forty is updated. Both places are kept.');
  },
  async fortyExtra(f, ctx) {
    const v = formValues(f), p = ctx.store.get('place', v.placeId); if (!p) throw new Error('Choose a place.');
    const e = { id: 'extra-' + newId('').slice(1, 18), name: p.name, country: p.country, placeId: p.id, experience: v.experience || '' };
    await ctx.store.create('fortyExtra', e); ctx.nav('/forty?group=optional', { replace: true }); toast(p.name + ' added to Optional places');
  },
};

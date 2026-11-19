import { esc, icon, photo, pill, statusTone, field, formValues, compass, empty, coverId } from '../kit.js';
import { TRIP_STATUSES } from '../../core/model.js';
import { newId } from '../../core/store.js';
import { costTotals, money, nightsOf, budgetLabel, prettyDate, legDuration, todayISO } from '../../core/domain.js';
import { windowLabel, tripChecks, unassigned } from '../../core/plan.js';
import { fortyModel } from '../../core/domain.js';

const GROUPS = [['Under way', t => !t.planId && !t.foldedInto?.length && ['Planning', 'Booked', 'Researching'].includes(t.status)], ['Ideas', t => !t.planId && !t.foldedInto?.length && t.status === 'Idea'], ['Only when safe', t => t.status === 'On hold'], ['Completed', t => t.status === 'Completed']];

export function partnerBadges(ctx, t) {
  const legs = ctx.store.records('segments', t.id).filter(l => l.option.startsWith('Partner'));
  return legs.map(l => '<span class="pill ' + (l.partner === 'yes' ? 'visited' : l.partner === 'no' ? 'hold' : 'wish') + '">' + esc(l.option) + ': ' + esc(l.partner) + '</span>').join(' ');
}
function planTile(t, ctx) {
  const c = tripChecks(ctx.store, ctx.PLAN, ctx.FORTY, t);
  return '<li><a class="trip-tile" href="/journeys/' + esc(t.id) + '">' + (coverId(ctx, t) ? photo(ctx.PHOTOS, coverId(ctx, t), { cls: 'tile-photo' }) : '<div class="tile-photo drawn">' + compass + '</div>') +
    '<div class="tile-body"><div class="row between">' + pill(t.status, statusTone(t.status)) + '<span class="muted small">' + esc(windowLabel(t.windowStart, t.windowEnd)) + (t.lengthNote ? ' · ' + esc(t.lengthNote) : '') + '</span></div><h3>' + esc(t.name) + '</h3><p>' + esc(t.scope || '') + '</p>' +
    '<p class="badges">' + partnerBadges(ctx, t) + '</p>' +
    (c.seasonWarnings.length ? '<p class="flag-line">' + icon('alert') + ' Outside best months: ' + esc(c.seasonWarnings.map(s => s.entry.name).join(', ')) + '</p>' : '') +
    (c.afterDeadline ? '<p class="flag-line">' + icon('alert') + ' Ends after your forty date</p>' : '') + '</div></a></li>';
}
function tile(t, ctx) {
  const tot = costTotals(ctx.store.list('cost', t.id));
  return '<li><a class="trip-tile" href="/journeys/' + esc(t.id) + '">' + (coverId(ctx, t) ? photo(ctx.PHOTOS, coverId(ctx, t), { cls: 'tile-photo' }) : '<div class="tile-photo drawn">' + compass + '</div>') +
    '<div class="tile-body"><div class="row between">' + pill(t.status, statusTone(t.status)) + (t.startDate ? '<span class="muted small">' + esc(prettyDate(t.startDate, { month: 'short', year: 'numeric' })) + '</span>' : '') + '</div><h3>' + esc(t.name) + '</h3><p>' + esc(t.scope || '') + '</p>' +
    '<p class="muted small">' + (t.stops?.length || 0) + ((t.stops?.length || 0) === 1 ? ' stop · ' : ' stops · ') + nightsOf(t) + ' nights · ' + esc(budgetLabel(t)) + (tot.length ? ' · ' + tot.map(x => money(x.known, x.currency) + ' known' + (x.unknown ? ', ' + x.unknown + ' unpriced' : '')).join('; ') : '') + '</p>' +
    (t.nextAction ? '<p class="next">' + icon('arrow') + ' ' + esc(t.nextAction) + '</p>' : '') + '</div></a></li>';
}

function planSection(ctx, trips) {
  const plan = trips.filter(t => t.planId).sort((a, b) => (a.windowStart || '').localeCompare(b.windowStart || ''));
  const folded = trips.filter(t => !t.planId && t.foldedInto?.length);
  if (!plan.length) return '';
  const f = fortyModel(ctx.store, ctx.FORTY), loose = unassigned(ctx.store, ctx.FORTY, f.selection);
  const deadline = ctx.store.setting('fortyDeadline'), days = deadline ? Math.round((new Date(deadline) - new Date(todayISO())) / 864e5) : null;
  return '<h2 class="group-title">The plan</h2><p class="muted">' + plan.length + ' trips' + (deadline ? ' · ' + days.toLocaleString('en-AU') + ' days until ' + esc(prettyDate(deadline)) : '') + '. Windows are targets, not bookings.</p>' +
    (loose.length ? '<p class="notice hold">' + loose.length + ' of the forty are not in a trip yet: ' + esc(loose.map(id => f.entries.find(e => e.id === id)?.name).join(', ')) + '. Choose a journey on each place’s page.</p>' : '') +
    '<ul class="trip-tiles">' + plan.map(t => planTile(t, ctx)).join('') + '</ul>' +
    (folded.length ? '<h2 class="group-title">Earlier ideas, now in the plan</h2><ul class="rows">' + folded.map(t => '<li><a class="row-item" href="/journeys/' + esc(t.id) + '"><span><strong>' + esc(t.name) + '</strong><small>Folded into ' + esc(t.foldedInto.map(id => trips.find(x => x.id === id)?.name || id).join(' and ')) + '. Notes kept.</small></span>' + icon('arrow') + '</a></li>').join('') + '</ul>' : '');
}

export const list = {
  render(ctx) {
    const trips = ctx.store.list('trip'), q = ctx.route.query;
    if (q.view === 'compare') return compare(ctx, trips);
    return {
      title: 'Journeys', screen: 'journeys',
      html: '<section class="page wide"><div class="section-head"><div><p class="eyebrow">From someday to somewhere</p><h1>Your journeys</h1><p class="lede">Each journey keeps its route, days, bookings, money, research and memories together.</p></div><div class="row"><a class="btn ghost" href="/journeys?view=compare">Compare</a><a class="btn primary" href="/journeys/new">' + icon('plus') + ' New journey</a></div></div>' +
        planSection(ctx, trips) + (trips.length ? GROUPS.map(([label, test]) => { const g = trips.filter(test); return g.length ? '<h2 class="group-title">' + label + '</h2>' + (label === 'Only when safe' ? '<p class="muted">These stay on hold under your only-when-safe condition. Wanderlust does not decide when travel is safe.</p>' : '') + '<ul class="trip-tiles">' + g.map(t => tile(t, ctx)).join('') + '</ul>' : ''; }).join('') : empty('No journeys yet.', 'Start with a feeling, a season or a place.', '<a class="btn primary" href="/journeys/new">New journey</a>')) + '</section>',
    };
  },
};

function compare(ctx, trips) {
  const rows = trips.map(t => {
    const legs = ctx.store.records('legs', t.id), prefs = ctx.store.records('preferences', t.id).at(-1) || {}, costs = ctx.store.list('cost', t.id), tot = costTotals(costs);
    const hours = legs.reduce((n, l) => n + (legDuration(l) ?? (+l.hours || 0)) + (+l.buffer || 0), 0);
    const flags = [t.status === 'On hold' ? 'On hold: review current advice first' : '', tot.some(x => x.unknown) ? tot.reduce((n, x) => n + x.unknown, 0) + ' unpriced cost items' : '', !t.stops?.length ? 'Choose stops' : '', legs.some(l => l.status === 'To research') ? 'Connections to research' : '', legs.length < Math.max(0, (t.stops?.length || 0) - 1) ? 'Missing connections between stops' : '', prefs.duration && nightsOf(t) + 1 > +prefs.duration ? 'Nights exceed available days' : ''].filter(Boolean);
    return '<tr><th scope="row"><a href="/journeys/' + esc(t.id) + '">' + esc(t.name) + '</a><small>' + esc(t.status) + '</small></th><td>' + esc(prefs.season || 'Season undecided') + '<small>' + esc(t.startDate ? prettyDate(t.startDate) : 'No start date') + (prefs.duration ? ' · ' + esc(prefs.duration) + ' days available' : '') + '</small></td><td>' + (t.stops?.length || 0) + ' stops · ' + nightsOf(t) + ' nights<small>' + Math.round(hours) + ' h of entered travel and buffers</small></td><td>' + esc(budgetLabel(t)) + '<small>' + (tot.map(x => money(x.known, x.currency) + ' known · ' + money(x.paid, x.currency) + ' paid').join('; ') || 'No costs entered') + '</small></td><td>' + esc(flags.join(' · ') || 'Check entry, transport and total time before booking.') + '</td></tr>';
  }).join('');
  return { title: 'Compare journeys', html: '<section class="page wide"><a class="back" href="/journeys">' + icon('back') + ' Journeys</a><h1>Which journey is calling?</h1><p class="lede">A side-by-side view of what you have saved. It flags simple gaps; it does not certify that a route is feasible.</p><div class="table-wrap"><table class="table"><thead><tr><th>Journey</th><th>When</th><th>Route</th><th>Money</th><th>Still to do</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' };
}

export const create = {
  render() {
    return { title: 'New journey', html: '<section class="page narrow"><a class="back" href="/journeys">' + icon('back') + ' Journeys</a><h1>Where next?</h1><form data-form="tripCreate" class="grid-form">' + field(['name', 'Journey name'], '', { required: true }) + field(['scope', 'Countries, regions or alternatives', 'textarea'], '') + field(['status', 'Stage', 'select', TRIP_STATUSES], 'Idea') + '<div class="wide row end"><button class="btn primary">Create journey</button></div></form></section>' };
  },
};
export const wallet = {
  render(ctx) {
    const trips = ctx.store.list('trip'), all = ctx.store.list('bookings');
    const upcoming = all.filter(b => !b.end || b.end >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const by = {}; for (const b of upcoming) (by[b.trip] ??= []).push(b);
    return {
      title: 'Wallet', screen: 'wallet',
      html: '<section class="page narrow"><p class="eyebrow">Every booking, one tap away</p><h1>Wallet</h1><p class="lede">Bookings and documents from all your journeys. Each one lives in its journey; this is the quick way in.</p>' +
        (upcoming.length ? Object.entries(by).map(([tid, list]) => '<h2 class="group-title">' + esc(trips.find(t => t.id === tid)?.name || 'Journey') + '</h2><ul class="rows">' + list.map(b => '<li><a class="row-item" href="/journeys/' + esc(tid) + '/wallet?open=' + esc(b.id) + '">' + icon(b.file ? 'file' : 'pin') + '<span><strong>' + esc(b.title) + '</strong><small>' + esc([b.type, b.reference && 'Ref ' + b.reference, b.date && prettyDate(b.date)].filter(Boolean).join(' · ')) + '</small></span>' + icon('arrow') + '</a></li>').join('') + '</ul>').join('') : empty('Your wallet is empty.', 'Add bookings inside a journey’s Wallet tab. They gather here.', '<a class="btn" href="/journeys">Journeys</a>')) +
        (all.length > upcoming.length ? '<p class="muted small">' + (all.length - upcoming.length) + ' past booking(s) stay in their journeys.</p>' : '') + '</section>',
    };
  },
};

export const forms = {
  async tripCreate(f, ctx) {
    const v = formValues(f); if (!v.name) throw new Error('Name the journey.');
    const t = { id: newId('trip'), name: v.name.slice(0, 150), scope: v.scope, status: v.status, lat: null, lon: null, theme: null, startDate: '', travellers: null, budget: null, budgetCurrency: 'AUD', budgetBasis: 'for the party', notes: '', nextAction: 'Choose a season, route and duration.', stops: [], adviceChecked: '', bookingNotes: '', countryQueries: [] };
    await ctx.store.create('trip', t); ctx.nav('/journeys/' + t.id, { replace: true });
  },
};
export const actions = {};

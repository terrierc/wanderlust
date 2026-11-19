// Plan: a timeline from this month to your target date (or your last planned trip). Trip bands sit over each trip's
// in-season months; drag a band (or use the arrow keys on it) to move its window.
import { esc, icon, field, formValues, toast, confirmDialog, qs } from '../kit.js';
import { newId } from '../../core/store.js';
import { prettyDate, todayISO, deadlines } from '../../core/domain.js';
import { rangeTotals, toAUD, savingsPlan } from '../../core/budget.js';
import { getRates } from '../rates.js';
import { money } from '../../core/domain.js';
import { PLAN_START, monthIndex, addMonths, windowLabel, tripFlags, seasonShare, leaveByYear, windowDates, overlaps } from '../../core/plan.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = n => n.replace(/^.*?: /, '');

function range(ctx, q) {
  const target = ctx.store.setting('fortyDeadline') || ctx.PLAN.deadline || '', last = ctx.store.list('trip').map(t => t.windowEnd || t.windowStart || '').sort().at(-1) || '';
  const end = [target.slice(0, 7), last, addMonths(PLAN_START, 23)].sort().at(-1);
  if (q.zoom === 'year') { const y = q.y || todayISO().slice(0, 4); return { from: y + '-01', count: 12, label: y }; }
  return { from: PLAN_START, count: monthIndex(end) + 1, label: prettyDate(PLAN_START + '-01', { month: 'short', year: 'numeric' }) + ' to ' + prettyDate(end + '-01', { month: 'short', year: 'numeric' }) };
}

function timeline(ctx, trips, r) {
  const pct = i => (i / r.count * 100).toFixed(3) + '%';
  const months = Array.from({ length: r.count }, (_, i) => addMonths(r.from, i));
  const head = months.map((m, i) => (r.count > 24 ? (m.endsWith('-01') || i === 0 ? '<span class="tl-year" style="left:' + pct(i) + '">' + m.slice(0, 4) + '</span>' : '') : '<span class="tl-mon" style="left:' + pct(i) + ';width:' + pct(1) + '">' + MON[+m.slice(5) - 1] + '</span>')).join('');
  const today = todayISO().slice(0, 7), ti = monthIndex(today, r.from);
  const dl = (ctx.store.setting('fortyDeadline') || ctx.PLAN.deadline || '9999-12').slice(0, 7), di = monthIndex(dl, r.from);
  const blackouts = ctx.store.list('blackouts').filter(b => b.start && b.end);
  const bRow = '<div class="tl-row"><div class="tl-label">Not available</div><div class="tl-track">' + blackouts.map(b => { const s = Math.max(0, monthIndex(b.start.slice(0, 7), r.from)), e = Math.min(r.count - 1, monthIndex(b.end.slice(0, 7), r.from)); return e < 0 || s >= r.count ? '' : '<span class="tl-block" style="left:' + pct(s) + ';width:' + pct(e - s + 1) + '" title="' + esc(b.title + ' · ' + (b.who || 'Both')) + '">' + esc(b.title) + '</span>'; }).join('') + '</div></div>';
  const rows = trips.map(t => {
    const s = monthIndex(t.windowStart, r.from), e = monthIndex(t.windowEnd || t.windowStart, r.from);
    const shade = months.map((m, i) => { const v = seasonShare(ctx.store, ctx.PLAN, ctx.FORTY, t, +m.slice(5)); return v ? '<span class="tl-season" style="left:' + pct(i) + ';width:' + pct(1) + ';opacity:' + (0.15 + v * 0.55).toFixed(2) + '"></span>' : ''; }).join('');
    const flags = tripFlags(ctx.store, ctx.PLAN, ctx.FORTY, t), partner = ctx.store.records('segments', t.id).filter(l => l.option.startsWith('Partner'));
    const band = e < 0 || s >= r.count ? '' : '<button class="tl-band' + (flags.length ? ' flagged' : '') + '" style="left:' + pct(Math.max(0, s)) + ';width:' + pct(Math.min(r.count, e + 1) - Math.max(0, s)) + '" data-band="' + esc(t.id) + '" aria-label="' + esc(t.name + ', ' + windowLabel(t.windowStart, t.windowEnd) + '. Use the left and right arrow keys to move by a month.') + '"><span>' + esc(short(t.name)) + '</span>' + (partner.length ? '<small>Partner ' + partner.map(l => l.option.slice(4) + ': ' + l.partner).join(', ') + '</small>' : '') + '</button>';
    return '<div class="tl-row"><div class="tl-label"><a href="/journeys/' + esc(t.id) + '">' + esc(short(t.name)) + '</a>' + (flags.length ? '<span class="flag">' + flags.length + '</span>' : '') + '</div><div class="tl-track" data-track>' + shade + band + '</div></div>';
  }).join('');
  return '<div class="tl" style="--months:' + r.count + '"><div class="tl-row tl-head"><div class="tl-label"></div><div class="tl-track">' + head + '</div></div>' + bRow + rows +
    (ti >= 0 && ti < r.count ? '<span class="tl-today" style="--at-n:' + ((ti + (+todayISO().slice(8) / 31)) / r.count).toFixed(4) + '" aria-hidden="true"><b>Today</b></span>' : '') +
    (di >= 0 && di < r.count ? '<span class="tl-deadline" style="--at-n:' + ((di + 0.68) / r.count).toFixed(4) + '" aria-hidden="true"><b>40</b></span>' : '') + '</div>';
}

function monthView(ctx, trips, m) {
  const [a, b] = [m + '-01', m + '-31'];
  const ts = trips.filter(t => { const w = windowDates(t); return w && overlaps(w[0], w[1], a, b); });
  const bl = ctx.store.list('blackouts').filter(x => x.start && x.end && overlaps(x.start, x.end, a, b));
  const dl = deadlines(ctx.store).filter(d => d.date.startsWith(m));
  const people = ctx.store.list('people').filter(p => p.passportExpiry?.startsWith(m));
  return '<div class="month-view"><section class="panel"><h2>Trips</h2>' + (ts.map(t => '<p><a href="/journeys/' + esc(t.id) + '">' + esc(t.name) + '</a> · ' + esc(windowLabel(t.windowStart, t.windowEnd)) + '</p>').join('') || '<p class="muted">No trip windows this month.</p>') + '</section>' +
    '<section class="panel"><h2>Not available</h2>' + (bl.map(x => '<p>' + esc(x.title) + ' · ' + esc(x.who || 'Both') + ' · ' + esc(prettyDate(x.start)) + ' to ' + esc(prettyDate(x.end)) + '</p>').join('') || '<p class="muted">Nothing blocked out.</p>') + '</section>' +
    '<section class="panel"><h2>Key dates</h2>' + ([...dl.map(d => '<p><b>' + esc(prettyDate(d.date, { day: 'numeric', month: 'short' })) + '</b> · ' + esc(d.kind) + ' · ' + esc(d.title) + '</p>'), ...people.map(p => '<p><b>' + esc(prettyDate(p.passportExpiry, { day: 'numeric', month: 'short' })) + '</b> · ' + esc(p.name) + '’s passport expires</p>')].join('') || '<p class="muted">No key dates.</p>') + '</section></div>';
}

export const view = {
  render(ctx) {
    const q = ctx.route.query, trips = ctx.store.list('trip').filter(t => t.planId && t.windowStart).sort((a, b) => a.windowStart.localeCompare(b.windowStart));
    const zoom = q.zoom || 'all', y = q.y || todayISO().slice(0, 4), m = q.m || todayISO().slice(0, 7);
    const r = range(ctx, q), people = ctx.store.list('people').filter(p => p.guest !== 'yes'), leave = leaveByYear(ctx.store);
    const flags = trips.map(t => [t, tripFlags(ctx.store, ctx.PLAN, ctx.FORTY, t)]).filter(([, f]) => f.length);
    const years = [...new Set(trips.map(t => t.windowStart.slice(0, 4)))].sort();
    const nav = '<div class="seg" role="group" aria-label="Zoom"><a href="/plan"' + (zoom === 'all' ? ' aria-current="true"' : '') + '>All</a><a href="/plan' + qs({ zoom: 'year', y }) + '"' + (zoom === 'year' ? ' aria-current="true"' : '') + '>Year</a><a href="/plan' + qs({ zoom: 'month', m }) + '"' + (zoom === 'month' ? ' aria-current="true"' : '') + '>Month</a></div>' +
      (zoom === 'year' ? '<div class="row"><a class="btn small ghost" href="/plan' + qs({ zoom: 'year', y: +y - 1 }) + '" aria-label="Previous year">' + icon('back') + '</a><b>' + esc(y) + '</b><a class="btn small ghost" href="/plan' + qs({ zoom: 'year', y: +y + 1 }) + '" aria-label="Next year">' + icon('arrow') + '</a></div>' : '') +
      (zoom === 'month' ? '<div class="row"><a class="btn small ghost" href="/plan' + qs({ zoom: 'month', m: addMonths(m, -1) }) + '" aria-label="Previous month">' + icon('back') + '</a><b>' + esc(prettyDate(m + '-01', { month: 'long', year: 'numeric' })) + '</b><a class="btn small ghost" href="/plan' + qs({ zoom: 'month', m: addMonths(m, 1) }) + '" aria-label="Next month">' + icon('arrow') + '</a></div>' : '');
    const leaveRows = people.map(p => '<tr><th scope="row">' + esc(p.name) + '<small>' + esc(p.allowanceNote || '') + '</small></th>' + years.map(yy => { const v = leave[p.id]?.[yy] || { planned: 0, maybe: 0, unknown: 0 }, over = p.daysPerYear && v.planned > +p.daysPerYear; return '<td class="' + (over ? 'over' : '') + '">' + v.planned + ' days' + (v.maybe ? '<small>+ ' + v.maybe + ' maybe</small>' : '') + (over ? '<small class="flag">over ' + esc(p.daysPerYear) + '</small>' : '') + '</td>'; }).join('') + '</tr>').join('');
    return {
      title: 'Plan', screen: 'plan',
      html: '<section class="page wide"><div class="section-head"><div><p class="eyebrow">Your travel plan</p><h1>The <em>plan.</em></h1><p class="lede">' + esc(r.label) + '. Shaded months are when a trip’s places are in season. Drag a trip, or focus it and use the arrow keys, to move its window.</p></div>' + nav + '</div>' +
        (zoom === 'month' ? monthView(ctx, trips, m) : '<div class="tl-scroll">' + timeline(ctx, trips, r) + '</div>') +
        '<section class="panel"><h2>Things to look at</h2>' + (flags.length ? '<ul class="plain">' + flags.map(([t, f]) => '<li><a href="/journeys/' + esc(t.id) + '"><b>' + esc(short(t.name)) + '</b></a><ul class="plain flags">' + f.map(x => '<li>' + icon('alert') + ' ' + esc(x.text) + '</li>').join('') + '</ul></li>').join('') + '</ul>' : '<p class="muted">Nothing flagged. Flags never block a plan; they are reminders.</p>') + '</section>' +
        '<section class="panel"><h2>Days away each year</h2><p class="muted small">Estimated from each leg’s dates, or its length (the longer figure) when dates aren’t set. Partner counts legs marked “yes”; “maybe” is shown separately.</p><div class="table-wrap"><table class="table"><thead><tr><th>Traveller</th>' + years.map(yy => '<th>' + yy + '</th>').join('') + '</tr></thead><tbody>' + leaveRows + '</tbody></table></div></section>' +
        '<div class="overview-grid"><section class="panel"><h2>Travellers</h2>' + people.map(p => '<form class="grid-form" data-form="personSave"><input type="hidden" name="id" value="' + esc(p.id) + '"><h3 class="wide">' + esc(p.fullName || p.name) + '</h3>' + field(['name', 'Name'], p.name) + field(['homeAirport', 'Home airport code (e.g. LHR)'], p.homeAirport, { hint: 'Used for fare search links.' }) + field(['maxDaysPerTrip', 'Comfortable maximum per trip (days)', 'number', [1, 365]], p.maxDaysPerTrip) + field(['daysPerYear', 'Leave available per year (days)', 'number', [0, 366]], p.daysPerYear, { hint: 'Blank means not set; no yearly warning.' }) + field(['passportExpiry', 'Passport expiry', 'date'], p.passportExpiry, { hint: 'Warns if within six months of a trip’s return.' }) + '<div class="wide row end"><button class="btn">Save ' + esc(p.name) + '</button></div></form>').join('') + '</section>' +
        '<section class="panel"><h2>Not available</h2><p class="muted small">Shoots, productions and work commitments. Trips that overlap are flagged.</p><ul class="plain">' + ctx.store.list('blackouts').map(b => '<li class="row between"><span><b>' + esc(b.title) + '</b> · ' + esc(b.who || 'Both') + '<br><small class="muted">' + esc(prettyDate(b.start)) + ' to ' + esc(prettyDate(b.end)) + '</small></span><button class="iconbtn" data-act="blackoutDelete" data-id="' + esc(b.id) + '" aria-label="Remove ' + esc(b.title) + '">' + icon('trash') + '</button></li>').join('') + '</ul>' +
        '<form class="grid-form" data-form="blackoutAdd">' + field(['title', 'What'], '', { required: true }) + field(['who', 'Who', 'select', ['You', 'Partner', 'Both']], 'You') + field(['start', 'From', 'date'], '', { required: true }) + field(['end', 'To', 'date'], '', { required: true }) + '<div class="wide row end"><button class="btn">Block out</button></div></form></section></div>' +
        '<section class="panel"><h2>Money across the plan</h2><p class="muted small">Likely totals in each original currency, by the year a trip starts. Unpriced lines are counted, never treated as zero.</p><div class="table-wrap"><table class="table"><thead><tr><th>Year</th><th>Likely, by currency</th><th>Paid</th></tr></thead><tbody>' + years.map(yy => { const costs = trips.filter(t => t.windowStart.startsWith(yy)).flatMap(t => ctx.store.list('cost', t.id)), tot = rangeTotals(costs); return '<tr><th scope="row">' + yy + '</th><td>' + (tot.map(x => money(x.likely, x.currency) + (x.unknown ? ' (+' + x.unknown + ' unpriced)' : '')).join('<br>') || '<span class="muted">No costs yet</span>') + '</td><td>' + (tot.map(x => money(x.paid, x.currency)).join('<br>') || '—') + '</td></tr>'; }).join('') + '</tbody></table></div><div id="rollAUD"></div><button class="btn small ghost" data-act="rollupAUD">Show AUD estimate and monthly savings</button></section>' +
        '<section class="panel"><h2>Points and miles</h2><form class="grid-form" data-form="pointsSave">' + field(['pointsQantas', 'Qantas Frequent Flyer balance', 'number', [0, 100000000]], ctx.store.setting('pointsQantas')) + field(['pointsVelocity', 'Velocity balance', 'number', [0, 100000000]], ctx.store.setting('pointsVelocity')) + field(['pointsChecked', 'Balances checked on', 'date'], ctx.store.setting('pointsChecked')) + '<div class="wide row end"><button class="btn">Save balances</button></div></form><p class="muted small">Trips planned as a reward redemption: ' + (esc(trips.filter(t => t.rewardPlan).map(t => short(t.name) + ' (' + t.rewardPlan + ')').join(', ')) || 'none yet. Set it on a trip’s Overview.') + '</p></section>' +
        '<section class="panel" id="feed"><h2>Calendar subscription</h2><p class="muted">One private link that keeps Google Calendar or Apple Calendar up to date with every key date: permit releases, payments, cancellations, reviews, reminders and passport expiry. Anyone with the link can read those dates, so keep it to yourselves; you can replace it any time.</p><div id="feedOut"></div><div class="row"><button class="btn" data-act="feedGet">' + icon('download') + ' Show my calendar link</button><button class="btn ghost" data-act="feedRotate">Replace the link</button></div><p class="muted small">Needs a connection. The one-off export (Journeys → Tasks) still works offline.</p></section></section>',
      mount(root) {
        root.querySelectorAll('[data-band]').forEach(b => {
          const shift = async n => { const t = ctx.store.get('trip', b.dataset.band); await ctx.store.patch('trip', t.id, { windowStart: addMonths(t.windowStart, n), windowEnd: addMonths(t.windowEnd || t.windowStart, n) }); toast(short(t.name) + ' moved to ' + windowLabel(addMonths(t.windowStart, n), addMonths(t.windowEnd || t.windowStart, n))); requestAnimationFrame(() => document.querySelector('[data-band="' + t.id + '"]')?.focus()); };
          b.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); shift(e.key === 'ArrowLeft' ? -1 : 1); } });
          b.addEventListener('pointerdown', e => {
            const track = b.closest('[data-track]'), w = track.clientWidth / r.count, x0 = e.clientX; let moved = 0;
            b.setPointerCapture(e.pointerId);
            const move = ev => { moved = Math.round((ev.clientX - x0) / w); b.style.transform = 'translateX(' + moved * w + 'px)'; };
            const up = () => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); b.style.transform = ''; if (moved) shift(moved); else ctx.nav('/journeys/' + b.dataset.band); };
            b.addEventListener('pointermove', move); b.addEventListener('pointerup', up);
          });
          b.addEventListener('click', e => e.preventDefault());
        });
      },
    };
  },
};

export const forms = {
  async pointsSave(f, ctx) { const v = formValues(f); for (const [k, val] of Object.entries(v)) { const x = val === null || val === '' ? null : String(val); if ((ctx.store.setting(k, null) ?? null) !== x) await ctx.store.setSetting(k, x); } toast('Balances saved'); },
  async personSave(f, ctx) { const v = formValues(f), id = v.id; delete v.id; for (const k of Object.keys(v)) v[k] = v[k] === null ? '' : String(v[k]); if (!v.name) delete v.name; if (v.homeAirport !== undefined) v.homeAirport = v.homeAirport.trim().toUpperCase(); await ctx.store.patch('people', id, v); toast('Saved'); },
  async blackoutAdd(f, ctx) { const v = formValues(f); if (v.end < v.start) throw new Error('The end must be on or after the start.'); await ctx.store.create('blackouts', { id: newId('blackout'), trip: '', title: v.title, who: v.who, start: v.start, end: v.end }); f.reset(); toast('Blocked out'); },
};
export const actions = {
  async rollupAUD(el, ctx) {
    const r = await getRates(ctx), out = document.getElementById('rollAUD');
    if (!r) { out.innerHTML = '<p class="notice">No exchange rates on this device yet. Needs a connection once.</p>'; return; }
    const trips = ctx.store.list('trip').filter(t => t.planId && t.windowStart).sort((a, b) => a.windowStart.localeCompare(b.windowStart));
    const rows = trips.map(t => { const s = savingsPlan(ctx.store, t, r); return '<tr><th scope="row">' + esc(short(t.name)) + '</th><td>' + money(Math.round(s.aud.likely), 'AUD') + (s.complete ? '' : '<small>more to price</small>') + '</td><td>' + money(Math.round(s.saved), 'AUD') + '</td><td>' + (s.perMonth == null ? '—' : money(Math.round(s.perMonth), 'AUD') + '<small>for ' + s.months + ' months</small>') + '</td></tr>'; }).join('');
    const all = toAUD(rangeTotals(trips.flatMap(t => ctx.store.list('cost', t.id))), r);
    out.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th>Trip</th><th>Likely (AUD est.)</th><th>Saved</th><th>Needed a month</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="small muted">Whole plan: about ' + money(Math.round(all.likely), 'AUD') + ' likely (' + money(Math.round(all.low), 'AUD') + ' to ' + money(Math.round(all.high), 'AUD') + '). Estimate using ' + esc(r.source) + ' for ' + esc(r.date) + '.' + (all.missing.length ? ' Not converted (no rate): ' + esc(all.missing.join(', ')) + '.' : '') + ' Per person figures arrive with shared expenses.</p>';
  },
  async blackoutDelete(el, ctx) { if (await confirmDialog('Remove this blocked-out period?', { ok: 'Remove' })) await ctx.store.remove('blackouts', el.dataset.id); },
  async feedGet(el, ctx) { await showFeed(ctx, 'GET'); },
  async feedRotate(el, ctx) { if (await confirmDialog('Replace your calendar link?', { ok: 'Replace', detail: 'Calendars using the old link stop updating. Add the new link to them.' })) await showFeed(ctx, 'POST'); },
  async copyFeed(el) { try { await navigator.clipboard.writeText(el.dataset.url); toast('Copied'); } catch { toast('Copy is not available here'); } },
};
async function showFeed(ctx, method) {
  const r = await ctx.sync.request('/api/feed', { method, headers: { 'Content-Type': 'application/json' } });
  const url = location.origin + '/feed/' + r.token + '.ics', webcal = url.replace(/^https?:/, 'webcal:');
  document.getElementById('feedOut').innerHTML = '<p><code>' + esc(url) + '</code></p><div class="row"><button class="btn small" data-act="copyFeed" data-url="' + esc(url) + '">Copy link</button><a class="btn small ghost" href="' + esc(webcal) + '">Open in Apple Calendar</a></div><p class="muted small">Google Calendar: Other calendars → From URL → paste the link. Updates arrive on Google’s schedule (often a few hours).</p>';
}

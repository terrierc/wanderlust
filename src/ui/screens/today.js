import { esc, icon, ext, empty } from '../kit.js';
import { fab, spendPanel } from '../expense.js';
import { todayISO, prettyDate, addDays, deadlines, legDuration, staleness } from '../../core/domain.js';

// Which journey is "today"? The one whose saved dates include today's local date.
function activeTrip(store) {
  const t0 = todayISO();
  return store.list('trip').find(t => { const ds = [...store.records('days', t.id), ...store.records('bookings', t.id), ...store.records('legs', t.id)].map(r => r.date).filter(Boolean).sort(); return ds.length && ds[0] <= t0 && ds.at(-1) >= t0; })
    || store.list('trip').filter(t => t.startDate && t.startDate >= t0).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}

export const view = {
  render(ctx) {
    const { store } = ctx, q = ctx.route.query, trips = store.list('trip');
    const t = (q.trip && store.get('trip', q.trip)) || activeTrip(store) || trips[0];
    if (!t) return { title: 'Today', html: '<section class="page narrow today">' + empty('No journeys yet.', 'Today shows your plan for the day once a journey has dates.') + '</section>' };
    const days = store.records('days', t.id);
    const tz = days.find(d => d.tz)?.tz;
    const date = q.date || todayISO(tz);
    const plan = days.filter(r => r.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const legs = store.records('legs', t.id).filter(r => r.date === date || r.arriveDate === date);
    const stays = store.records('bookings', t.id).filter(r => r.date === date || (r.date && r.end && r.date <= date && r.end >= date));
    const brief = store.records('preferences', t.id).at(-1);
    const contacts = store.records('contacts', t.id), phrases = store.records('phrases', t.id);
    const safety = store.records('research', t.id).filter(r => ['Safety / insurance', 'Health', 'Entry / visa'].includes(r.topic));
    const due = deadlines(store, t.id).filter(d => d.date >= date && d.date <= addDays(date, 7));
    const card = (title, body, cls = '') => '<section class="tcard ' + cls + '"><h2>' + title + '</h2>' + body + '</section>';
    return {
      title: 'Today', screen: 'today',
      html: '<section class="page narrow today"><div class="today-head"><p class="eyebrow">' + esc(t.name) + (tz ? ' · local time ' + esc(tz) : '') + '</p><h1>' + esc(prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long' })) + '</h1>' +
        '<form class="row wrap" data-form="noop" data-live="1"><div class="field"><label for="tt">Journey</label><select id="tt" data-change="todayTrip">' + trips.map(x => '<option value="' + esc(x.id) + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div><div class="field"><label for="td">Date</label><input id="td" type="date" value="' + date + '" data-change="todayDate"></div></form></div>' +
        card('The plan', plan.length ? '<ol class="timeline">' + plan.map(r => '<li><span class="time">' + esc(r.time || '—') + '</span><div><strong>' + esc(r.title) + '</strong>' + (r.location ? '<p>' + icon('pin') + ' ' + esc(r.location) + '</p>' : '') + (r.transport ? '<p>' + esc(r.transport) + '</p>' : '') + (r.duration ? '<p class="muted">' + esc(r.duration) + '</p>' : '') + (r.notes ? '<p class="notes">' + esc(r.notes) + '</p>' : '') + (r.url ? ext(r.url, 'Details') : '') + '</div></li>').join('') + '</ol>' : '<p>Nothing planned for this day. Leave it open, or <a href="/journeys/' + esc(t.id) + '/days?add=days#form-days">add something</a>.</p>') +
        (legs.length ? card('On the move', legs.map(l => { const d = legDuration(l); return '<div class="leg"><strong>' + esc(l.from) + ' → ' + esc(l.to) + '</strong><p>' + esc([l.mode, l.operator, l.departTime && 'departs ' + l.departTime + (l.departTz ? ' (' + l.departTz + ')' : ''), l.arriveTime && 'arrives ' + (l.arriveDate && l.arriveDate !== l.date ? prettyDate(l.arriveDate, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' : '') + l.arriveTime + (l.arriveTz ? ' (' + l.arriveTz + ')' : ''), d !== null && d.toFixed(1) + ' h'].filter(Boolean).join(' · ')) + '</p>' + (l.notes ? '<p class="notes">' + esc(l.notes) + '</p>' : '') + '</div>'; }).join('')) : '') +
        (stays.length ? card('Bookings for today', stays.map(b => '<div class="booking"><strong>' + esc(b.title) + '</strong>' + (b.reference ? '<p class="ref">Ref <span>' + esc(b.reference) + '</span></p>' : '') + (b.address ? '<p>' + icon('pin') + ' ' + esc(b.address) + ' <button class="btn small ghost" data-act="copyText" data-text="' + esc(b.address) + '">Copy</button></p>' : '') + (b.phone ? '<p><a href="tel:' + esc(b.phone) + '">' + esc(b.phone) + '</a></p>' : '') + (b.file ? '<a class="btn small" data-file-link="' + esc(b.file) + '" download="' + esc(b.filename || 'booking') + '">' + icon('file') + ' ' + esc(b.filename || 'Booking document') + '</a>' : '') + '</div>').join('')) : '') +
        card('Keep close', (brief?.needs ? '<p>' + esc(brief.needs) + '</p>' : '') + (contacts.length ? '<h3>Contacts</h3><ul class="plain">' + contacts.map(c => '<li><strong>' + esc(c.name) + '</strong>' + (c.role ? ' · ' + esc(c.role) : '') + (c.phone ? ' · <a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '') + (c.checked ? ' <span class="muted small">verified ' + esc(c.checked) + '</span>' : ' <span class="flag">not verified</span>') + '</li>').join('') + '</ul>' : '<p class="muted">Add verified emergency, embassy and insurance contacts in Research before you go.</p>') +
          (phrases.length ? '<h3>Phrases</h3><ul class="plain phrases">' + phrases.map(p => '<li><strong>' + esc(p.phrase) + '</strong> — ' + esc(p.meaning || '') + '</li>').join('') + '</ul>' : '') +
          safety.map(r => '<p><strong>' + esc(r.title) + ':</strong> ' + esc(r.notes || '') + ' <span class="muted small">checked ' + esc(r.checked || 'not recorded') + '</span>' + (staleness(r) ? ' <span class="flag">' + esc(staleness(r)) + '</span>' : '') + '</p>').join(''), 'keep') +
        (due.length ? card('Coming up this week', '<ul class="deadlines">' + due.map(d => '<li><span class="date">' + esc(prettyDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })) + '</span><span>' + esc(d.kind) + ' · ' + esc(d.title) + '</span></li>').join('') + '</ul>') : '') +
        '<nav class="day-step" aria-label="Change day"><a class="btn" href="/today?trip=' + esc(t.id) + '&date=' + addDays(date, -1) + '" aria-label="Previous day">' + icon('back') + '<span>Previous</span></a><a class="btn primary" href="/today?trip=' + esc(t.id) + '">Today</a><a class="btn" href="/today?trip=' + esc(t.id) + '&date=' + addDays(date, 1) + '" aria-label="Next day"><span>Next</span> ' + icon('arrow') + '</a></nav>' +
        '<p class="row"><a class="btn ghost" href="/wallet">' + icon('file') + ' Wallet: all bookings</a><a class="btn ghost" href="/journeys/' + esc(t.id) + '">Open journey</a><a class="btn ghost" href="/journeys/' + esc(t.id) + '/emergency">' + icon('alert') + ' Emergency card</a></p>' + spendPanel(ctx, t, { date, compact: true }) + '<p class="muted small">Everything above is stored on this device. Links marked “Needs a connection” open websites.</p></section>' + fab(t.id, date),
      async mount(root) {
        const { fileURL } = await import('../../core/files.js');
        for (const a of root.querySelectorAll('a[data-file-link]')) fileURL(store, ctx.sync, a.dataset.fileLink).then(u => { a.href = u; }).catch(() => { a.removeAttribute('href'); a.textContent += ' (not on this device yet)'; });
      },
    };
  },
};
export const actions = {
  todayTrip(el, ctx) { ctx.setQuery({ trip: el.value, date: '' }); },
  todayDate(el, ctx) { ctx.setQuery({ date: el.value }); },
  async copyText(el, ctx) { try { await navigator.clipboard.writeText(el.dataset.text); ctx.toast('Copied'); } catch { ctx.toast('Copy is not available here'); } },
};
export const forms = {};

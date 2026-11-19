import { esc, icon, photo, pill, statusTone, field, formValues, ext, confirmDialog, toast, empty, safeURL, compass } from '../kit.js';
import { TRIP_STATUSES } from '../../core/model.js';
import { newId } from '../../core/store.js';
import { costTotals, money, nightsOf, budgetLabel, prettyDate, legDuration, staleness, deadlines, todayISO, isBlank, validZone } from '../../core/domain.js';
import { addFile, fileFields, fileURL } from '../../core/files.js';
import { download, calendarICS, offlineTripHTML, researchBrief } from '../../core/exports.js';
import { createMap } from '../map.js';
import { PIN } from './explore.js';
import { windowLabel, tripChecks, monthsLabel } from '../../core/plan.js';
import { CATEGORIES, STATES, rangeTotals, lineRange, toAUD, savingsPlan } from '../../core/budget.js';
import { getRates, audBlock } from '../rates.js';
import { SPLITS, perPerson, balances } from '../../core/shared.js';
import { settleHTML } from './settle.js';
import { legFlights, routeKey, routeStats } from '../../core/fares.js';

const TABS = [['overview', 'Overview'], ['route', 'Route'], ['days', 'Days'], ['wallet', 'Wallet'], ['money', 'Money'], ['tasks', 'Tasks'], ['research', 'Research'], ['together', 'Together'], ['journal', 'Journal']];
const PACKING = {
  'Polar expedition': ['Waterproof shell jacket and trousers', 'Insulated mid-layers', 'Thermal base layers', 'Warm hat, neck gaiter and waterproof gloves', 'Polarised sunglasses and high-SPF sunscreen', 'Seasickness remedies (ask your doctor)', 'Dry bags for camera gear'],
  'Safari': ['Neutral-coloured clothing', 'Binoculars', 'Wide-brim hat and sunscreen', 'Insect repellent', 'Soft-sided bag (light-aircraft weight limits)', 'Warm layer for early game drives', 'Headlamp'],
  'High-altitude trek': ['Broken-in boots', 'Layering system and down jacket', 'Sleeping bag rated for the conditions', 'Trekking poles', 'Water purification', 'Personal first-aid kit (ask a doctor about altitude medication)', 'Sun protection'],
  'Tropical reef': ['Reef-safe sunscreen', 'Rash vest', 'Mask and snorkel (if bringing your own)', 'Dive certification card and logbook', 'Light rain jacket', 'Insect repellent', 'Dry bag'],
  'Desert': ['Sun hat and sunglasses', 'Long, light sleeves', 'Warm layer for cold nights', 'Scarf for dust', 'Refillable water bottles', 'Lip balm and sunscreen', 'Headlamp'],
};
const HEALTH = [['Health', 'Vaccinations for this route (see a travel doctor 6 to 8 weeks before)', 'https://www.smartraveller.gov.au/before-you-go/health'], ['Entry / visa', 'Yellow fever certificate requirements for each border on this route', 'https://www.smartraveller.gov.au/destinations'], ['Health', 'Altitude: highest sleeping altitude and acclimatisation days', 'https://www.smartraveller.gov.au/before-you-go/health'], ['Health', 'Malaria risk areas on this route', 'https://www.smartraveller.gov.au/before-you-go/health'], ['Entry / visa', 'Visa type and how to apply, for each country (Australian passports)', 'https://www.smartraveller.gov.au/destinations'], ['Safety / insurance', 'Current travel advice level for each country', 'https://www.smartraveller.gov.au/destinations']];
const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD', 'JPY', 'CHF', 'NOK', 'SEK', 'DKK', 'ISK', 'IDR', 'THB', 'VND', 'INR', 'NPR', 'CNY', 'KRW', 'SGD', 'AED', 'TRY', 'EGP', 'JOD', 'MAD', 'ZAR', 'BWP', 'NAD', 'TZS', 'KES', 'RWF', 'UZS', 'KGS', 'MNT', 'PEN', 'CLP', 'ARS', 'BRL', 'BOB', 'GTQ', 'MXN', 'XPF', 'MGA', 'BTN', 'KHR'];
export const SCHEMAS = {
  legs: { title: 'Connections', noun: 'connection', intro: 'Each real transport link, including international flights. Times are local to each end, so durations stay right across time zones and the date line.', fields: [['from', 'From', 'text', null, true], ['to', 'To', 'text', null, true], ['mode', 'Transport', 'select', 'Flight|Train|Ferry|Drive|Bus|Walk|Tour|Other'], ['date', 'Departure date (local)', 'date'], ['departTime', 'Departure time (local)', 'time'], ['departTz', 'Departure time zone', 'zone'], ['arriveDate', 'Arrival date (local)', 'date'], ['arriveTime', 'Arrival time (local)', 'time'], ['arriveTz', 'Arrival time zone', 'zone'], ['hours', 'Door-to-door hours (if times unknown)', 'number', [0, 200, 'any']], ['buffer', 'Buffer / recovery hours', 'number', [0, 200, 'any']], ['operator', 'Operator / service'], ['status', 'Evidence', 'select', 'To research|Researched|Booked'], ['url', 'Official source or booking link', 'url'], ['checked', 'Source checked on', 'date'], ['notes', 'Transfers, borders, access and alternatives', 'textarea']] },
  days: { title: 'Day by day', noun: 'activity', intro: 'Dated plans for this journey. Include arrival, recovery and buffer time. Times are local to the place.', fields: [['date', 'Date (local)', 'date', null, true], ['time', 'Start time (local)', 'time'], ['tz', 'Time zone', 'zone'], ['title', 'Activity, rest or transfer', 'text', null, true], ['location', 'Location or full address'], ['duration', 'Duration / opening hours (as checked)'], ['transport', 'How to get there'], ['url', 'Official link', 'url'], ['notes', 'Details, bookings and alternatives', 'textarea']] },
  bookings: { title: 'Wallet', noun: 'booking', intro: 'Bookings and their documents. A booking’s price belongs in Money (linked below), so it is never counted twice.', fields: [['type', 'Type', 'select', 'Accommodation|Flight|Train / bus / ferry|Tour / ticket|Insurance|Other'], ['title', 'Booking / provider', 'text', null, true], ['reference', 'Booking reference'], ['date', 'Service / check-in date', 'date'], ['end', 'End / check-out date', 'date'], ['address', 'Address / meeting point'], ['phone', 'Provider phone'], ['url', 'Manage booking', 'url'], ['cancellation', 'Free cancellation until', 'date'], ['payment', 'Payment due', 'date'], ['costId', 'Linked cost', 'cost'], ['notes', 'Terms, contacts and balance', 'textarea']], file: true },
  preferences: { title: 'Your travel brief', noun: 'brief', intro: 'A guided brief for planning and research. Keep passport numbers out of it.', fields: [['season', 'Travel window / season'], ['duration', 'Available days, including flights', 'number', [1, 365]], ['departure', 'Starting point / home airport'], ['passport', 'Passport nationality to plan with'], ['pace', 'Pace', 'select', 'Unhurried|Balanced|Full days'], ['comfort', 'Accommodation and comfort'], ['interests', 'What moves you?', 'textarea'], ['needs', 'Mobility, dietary needs and non-negotiables', 'textarea'], ['avoid', 'Things to avoid, budget flexibility', 'textarea']] },
  requests: { title: 'Research requests', noun: 'request', intro: 'Queue a question now, even offline. When synced, your connected ChatGPT Wanderlust tools can read it and save researched findings with sources. Nothing is researched on this device.', fields: [['title', 'What should be researched?', 'text', null, true], ['scope', 'Details, dates and constraints', 'textarea'], ['state', 'State', 'select', 'Queued|Sent to ChatGPT|Answered'], ['notes', 'Notes', 'textarea']] },
  research: { title: 'Findings', noun: 'finding', intro: 'Evidence beside the decision. A checked date records your review; findings past their review date are flagged.', fields: [['topic', 'Topic', 'select', 'Entry / visa|Safety / insurance|Transport|Season / weather|Accommodation|Permits / tickets|Health|Accessibility|Other'], ['title', 'Question or finding', 'text', null, true], ['status', 'Stage', 'select', 'Needs checking|Confirmed from source|Conflicting / uncertain|Outdated'], ['url', 'Primary source', 'url'], ['checked', 'Checked on', 'date'], ['review', 'Check again by', 'date'], ['notes', 'Finding, and the dates and nationality it applies to', 'textarea']] },
  contacts: { title: 'Contacts', noun: 'contact', intro: 'Only contacts you have verified. Record where and when you checked them.', fields: [['name', 'Name', 'text', null, true], ['role', 'Role (embassy, host, guide…)'], ['phone', 'Phone', 'tel'], ['email', 'Email', 'email'], ['address', 'Address'], ['source', 'Where verified', 'url'], ['checked', 'Verified on', 'date'], ['notes', 'Notes', 'textarea']] },
  phrases: { title: 'Phrases', noun: 'phrase', intro: 'Useful words for the road.', fields: [['phrase', 'Phrase', 'text', null, true], ['meaning', 'Meaning'], ['language', 'Language'], ['notes', 'Pronunciation / notes', 'textarea']] },
  votes: { title: 'Together', noun: 'preference', intro: 'Preferences by traveller. Names are planning labels, not accounts: sharing the site needs real authorised access through its hosting.', fields: [['person', 'Traveller', 'text', null, true], ['title', 'Place, route or decision', 'text', null, true], ['vote', 'Preference', 'select', 'Must do|Would love|Happy either way|Prefer to skip'], ['pace', 'Preferred pace'], ['budget', 'Comfortable spending'], ['notes', 'Why it matters / compromises', 'textarea']] },
  journal: { title: 'Journal', noun: 'memory', intro: 'A page a day: memories, photos and places to return to. Photos are shrunk before saving. Linking a place from the forty offers to mark it visited.', fields: [['title', 'Place or moment', 'text', null, true], ['date', 'Date', 'date'], ['end', 'End date', 'date'], ['placeId', 'Place', 'place'], ['location', 'Where exactly'], ['weather', 'Weather'], ['mood', 'Highlight', 'select', '|Highlight of the trip|Wonder|Peaceful|Hard but worth it|Funny|Tired'], ['rating', 'Feeling', 'select', '|Unforgettable|Loved it|Glad I went|Mixed'], ['return', 'Return wish', 'select', '|Would return|More to explore|Once was enough'], ['notes', 'The story you want to remember', 'textarea']], file: true },
  reminders: { title: 'Reminders', noun: 'reminder', intro: 'Deadlines shown here and in Today. For device alerts, export them to your calendar.', fields: [['title', 'What needs to happen', 'text', null, true], ['date', 'Date', 'date', null, true], ['kind', 'Type', 'select', 'Ticket release|Payment|Cancellation|Passport / visa|Research review|Packing|Other'], ['state', 'State', 'select', 'Open|Done'], ['url', 'Related link', 'url'], ['notes', 'Notes', 'textarea']] },
};

function recordForm(ctx, trip, kind, rec) {
  const s = SCHEMAS[kind], costs = ctx.store.list('cost', trip.id);
  const places = ctx.store.list('place');
  const fields = s.fields.map(([name, label, type = 'text', extra, required]) => type === 'place' ? field([name, label, 'select', [['', 'Not linked'], ...[...trip.stops || []].map(x => [x.id, x.name]), ...ctx.FORTY.entries.filter(e => ctx.store.get('fortyEntry', e.id)?.tripId === trip.id).map(e => [e.placeId, e.name]), ...places.filter(p => p.status !== 'Visited').slice(0, 0).map(p => [p.id, p.name])].filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i)], rec?.[name] || '') : type === 'cost' ? field([name, label, 'select', [['', 'Not linked'], ...costs.map(c => [c.id, (c.item || 'Cost') + ' · ' + money(c.total, c.currency)])]], rec?.[name] || '') : field([name, label, type, extra], rec?.[name] ?? '', { required })).join('');
  return '<form class="record-form grid-form" data-form="recordSave" id="form-' + kind + '"><input type="hidden" name="_kind" value="' + kind + '"><input type="hidden" name="_trip" value="' + esc(trip.id) + '">' + (rec ? '<input type="hidden" name="_id" value="' + esc(rec.id) + '">' : '') +
    '<h3 class="wide">' + (rec ? 'Edit ' + s.noun : 'Add a ' + s.noun) + '</h3>' + fields + (s.file ? '<div class="field wide"><label for="att-' + kind + '">' + (rec?.file ? 'Replace attachment (optional)' : 'Attach a PDF or photo (optional, up to ' + Math.floor((ctx.config.maxUpload || 1e7) / 1e5) / 10 + ' MB)') + '</label><input id="att-' + kind + '" name="attachment" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><small>Saved on this device first; uploads when you are online.</small></div>' : '') +
    '<p class="form-error wide" role="alert"></p><div class="wide row end"><a class="btn ghost" href="?">Cancel</a><button class="btn primary">' + (rec ? 'Save changes' : 'Save') + '</button></div></form>';
}

function recordCard(ctx, kind, r) {
  const s = SCHEMAS[kind];
  const title = kind === 'legs' ? r.from + ' → ' + r.to : kind === 'votes' ? r.person + ': ' + r.title : kind === 'preferences' ? 'Travel brief' + (r.season ? ' · ' + r.season : '') : kind === 'contacts' ? r.name : kind === 'phrases' ? r.phrase : r.title;
  const meta = [];
  if (kind === 'legs') { const d = legDuration(r); meta.push([r.mode, r.date && prettyDate(r.date) + (r.departTime ? ' ' + r.departTime : ''), r.arriveDate && 'arrives ' + prettyDate(r.arriveDate) + (r.arriveTime ? ' ' + r.arriveTime : '') + (r.arriveDate > r.date ? ' (+' + Math.round((new Date(r.arriveDate) - new Date(r.date)) / 864e5) + ')' : ''), d !== null ? d.toFixed(1) + ' h travel' : r.hours ? r.hours + ' h door to door' : '', r.buffer && r.buffer + ' h buffer', r.status].filter(Boolean).join(' · ')); }
  if (kind === 'research') { const st = staleness(r); meta.push([r.topic, r.status, r.checked ? 'checked ' + r.checked : ''].filter(Boolean).join(' · ')); if (st) meta.push('<span class="flag">' + esc(st) + '</span>'); }
  if (kind === 'bookings') { const c = r.costId && ctx.store.get('cost', r.costId); meta.push([r.type, r.reference && 'Ref ' + r.reference, r.date && prettyDate(r.date) + (r.end ? ' – ' + prettyDate(r.end) : '')].filter(Boolean).join(' · ')); if (r.cancellation) meta.push('Free cancellation until ' + prettyDate(r.cancellation)); meta.push(c ? 'Cost: ' + esc(c.item) + ' · ' + money(c.total, c.currency) + ' (counted once, in Money)' : 'No linked cost'); }
  if (kind === 'days') meta.push([r.time, r.tz, r.location, r.duration].filter(Boolean).join(' · '));
  if (kind === 'contacts') meta.push([r.role, r.phone, r.email, r.checked ? 'verified ' + r.checked : 'not yet verified'].filter(Boolean).join(' · '));
  if (kind === 'journal') meta.push([r.date && prettyDate(r.date), r.rating, r.return].filter(Boolean).join(' · '));
  if (kind === 'reminders') meta.push([r.kind, r.date && prettyDate(r.date), r.state].filter(Boolean).join(' · '));
  if (kind === 'requests') meta.push(r.state || 'Queued');
  if (kind === 'votes') meta.push([r.vote, r.pace, r.budget].filter(Boolean).join(' · '));
  if (kind === 'phrases') meta.push([r.meaning, r.language].filter(Boolean).join(' · '));
  if (kind === 'preferences') meta.push([r.duration && r.duration + ' days', r.pace, r.departure].filter(Boolean).join(' · '));
  const open = ctx.route.query.open === r.id;
  const att = r.file ? (r.filetype?.startsWith('image/') ? '<img class="att-img" data-file="' + esc(r.file) + '" alt="' + esc(r.filename || 'Attached photo') + '">' : '') + '<a class="att" data-file-link="' + esc(r.file) + '" download="' + esc(r.filename || 'document') + '">' + icon('file') + ' ' + esc(r.filename || 'Attachment') + '</a>' : '';
  return '<article class="record' + (open ? ' open' : '') + '" id="r-' + esc(r.id) + '"><div class="record-head"><h3>' + esc(title || s.noun) + '</h3><div class="row"><a class="iconbtn" href="?edit=' + esc(r.id) + '#form-' + kind + '" aria-label="Edit ' + esc(title) + '">' + icon('edit') + '</a><button class="iconbtn" data-act="recordDelete" data-kind="' + kind + '" data-id="' + esc(r.id) + '" aria-label="Remove ' + esc(title) + '">' + icon('trash') + '</button></div></div>' +
    meta.filter(Boolean).map(m => '<p class="meta">' + (m.startsWith('<span') ? m : esc(m)) + '</p>').join('') + (r.address ? '<p>' + icon('pin') + ' ' + esc(r.address) + '</p>' : '') + (r.notes || r.scope ? '<p class="notes">' + esc(r.notes || r.scope) + '</p>' : '') + (r.url ? ext(r.url, kind === 'research' ? 'Source' : 'Open link') : '') + (kind === 'contacts' && r.source ? ext(r.source, 'Where verified') : '') + att + '</article>';
}

function section(ctx, trip, kind) {
  const s = SCHEMAS[kind], q = ctx.route.query, rows = ctx.store.records(kind, trip.id).sort((a, b) => kind === 'days' ? ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')) : 0);
  const edit = q.edit && rows.find(r => r.id === q.edit), adding = q.add === kind;
  let list;
  if (kind === 'days' && rows.length) { const by = {}; for (const r of rows) (by[r.date || 'Undated'] ??= []).push(r); list = Object.entries(by).map(([d, rs]) => '<h4 class="date-head">' + esc(d === 'Undated' ? d : prettyDate(d)) + '</h4>' + rs.map(r => recordCard(ctx, kind, r)).join('')).join(''); }
  else list = rows.map(r => recordCard(ctx, kind, r)).join('');
  return '<section class="panel" id="s-' + kind + '"><div class="row between"><div><h2>' + s.title + '</h2><p class="muted">' + s.intro + '</p></div>' + (!adding && !edit ? '<a class="btn" href="?add=' + kind + '#form-' + kind + '">' + icon('plus') + ' Add</a>' : '') + '</div>' +
    (adding || edit ? recordForm(ctx, trip, kind, edit) : '') + (list || (!adding ? '<p class="muted empty-line">Nothing saved yet.</p>' : '')) + '</section>';
}

function flightsPanel(ctx, t) {
  const fl = legFlights(ctx.store, t); if (!fl.length) return '';
  return '<section class="panel"><h2>Flights to watch</h2><p class="muted small">Prefilled searches using each leg’s dates (or the start of the window) and party size. They open external sites and need a connection. Log what you find on the <a href="/deals">Deals board</a>.</p><ul class="plain">' +
    fl.map(f => { const key = routeKey(f.from, f.to), s = key ? routeStats(ctx.store, key) : null; return '<li class="flight"><b>' + esc(f.leg.option) + '</b> ' + (f.to ? esc(f.from) + ' → ' + esc(f.to) + ' · ' + f.adults + ' adult' + (f.adults > 1 ? 's' : '') : esc(f.note)) + (s?.latest ? ' · latest ' + money(+s.latest.price, s.latest.currency) + (s.good ? ' <span class="pill visited">at target</span>' : '') : '') + '<span class="row">' + f.links.map(l => ext(l.url, l.label)).join('') + (key ? '<a class="btn small ghost" href="/deals?route=' + esc(key) + '">Log a fare</a>' : '') + '</span></li>'; }).join('') + '</ul></section>';
}
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function planPanel(ctx, t) {
  const store = ctx.store, trips = store.list('trip');
  if (t.foldedInto?.length) return '<p class="notice">This earlier idea is now part of ' + t.foldedInto.map(id => '<a href="/journeys/' + esc(id) + '">' + esc(trips.find(x => x.id === id)?.name || id) + '</a>').join(' and ') + '. Its notes are kept here.</p>';
  if (!t.planId) return '<section class="panel plan-panel"><div class="row between"><div><p class="eyebrow">The plan</p><h2>Not on your plan timeline yet</h2><p class="muted small">Add it to see it on the Plan timeline, with season and leave checks.</p></div><button class="btn" data-act="planAdd" data-id="' + esc(t.id) + '">Add to the plan</button></div></section>';
  const c = tripChecks(store, ctx.PLAN, ctx.FORTY, t), planTrips = trips.filter(x => x.planId);
  const legs = store.records('segments', t.id).sort((a, b) => a.option.localeCompare(b.option));
  return '<section class="panel plan-panel"><div class="row between"><div><p class="eyebrow">The plan</p><h2>' + esc(windowLabel(t.windowStart, t.windowEnd)) + (t.lengthNote ? ' · ' + esc(t.lengthNote) : '') + '</h2><p class="muted">A target window, not a booking.</p></div>' +
    '<form class="row wrap" data-form="noop" data-live="1"><div class="field"><label for="ws">From</label><input id="ws" type="month" value="' + esc(t.windowStart || '') + '" data-change="tripWindow" data-id="' + esc(t.id) + '" data-field="windowStart"></div><div class="field"><label for="we">To</label><input id="we" type="month" value="' + esc(t.windowEnd || '') + '" data-change="tripWindow" data-id="' + esc(t.id) + '" data-field="windowEnd"></div></form></div>' +
    (c.afterDeadline ? '<p class="notice hold">' + icon('alert') + ' This window ends after your forty date (' + esc(prettyDate(c.deadline)) + ').</p>' : '') +
    '<h3>Places from the forty</h3>' + (c.season.some(s => s.best && !s.best.checked) ? '<p class="muted small">Best months come from your plan brief and have not yet been checked against a published source.</p>' : '') + '<div class="table-wrap"><table class="table season-table"><thead><tr><th>Place</th><th>Best months</th><th>This window</th><th>Trip</th></tr></thead><tbody>' +
    c.season.map(s => '<tr><th scope="row"><a href="/forty/' + esc(s.entry.id) + '">' + esc(s.entry.name) + '</a>' + (s.entry.conditional ? '<small>Conditional · check current advice</small>' : '') + (s.entry.historyUnconfirmed ? '<small>Visit history to confirm</small>' : '') + '</th><td>' + esc(s.best?.note || 'Not recorded') +  + '</td><td>' + (!s.best ? '—' : s.outside.length ? '<span class="flag">Outside: ' + esc(s.outside.map(m => MONTHS_FULL[m - 1].slice(0, 3)).join(', ')) + '</span>' : '<span class="pill visited">In season</span>') + '</td><td><label class="sr" for="mv-' + esc(s.entry.id) + '">Move ' + esc(s.entry.name) + ' to another trip</label><select id="mv-' + esc(s.entry.id) + '" data-change="fortyMove" data-entry="' + esc(s.entry.id) + '">' + planTrips.map(x => '<option value="' + esc(x.id) + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(x.name.replace(/^.*?: /, '')) + '</option>').join('') + '</select></td></tr>').join('') + '</tbody></table></div>' +
    '<h3>Legs and who travels</h3><p class="muted small">Your partner’s legs start as “maybe”. Either of you can change them. Each leg has its own way in and out, so your route does not change.</p><ul class="legs">' +
    legs.map(l => '<li class="leg-row"><div><strong>' + esc(l.option) + ': ' + esc(l.title) + '</strong><small>' + esc([l.party, l.length, l.flyIn && 'in ' + l.flyIn, l.flyOut && 'out ' + l.flyOut].filter(Boolean).join(' · ')) + '</small>' + (l.flag ? '<small class="flag">' + esc(l.flag) + '</small>' : '') + '</div>' + (l.option.startsWith('Partner') ? '<div class="field inline"><label for="vs-' + esc(l.id) + '">Partner</label><select id="vs-' + esc(l.id) + '" data-change="segPartner" data-id="' + esc(l.id) + '">' + ['maybe', 'yes', 'no'].map(v => '<option' + (l.partner === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>' : '') + '</li>').join('') + '</ul></section>';
}

function tabBody(ctx, t, tab) {
  const store = ctx.store, q = ctx.route.query;
  if (tab === 'overview') {
    const planHTML = planPanel(ctx, t);
    const costs = store.list('cost', t.id), tot = costTotals(costs), dl = deadlines(store, t.id).filter(d => d.date >= todayISO()).slice(0, 4);
    return planHTML + '<div class="overview-grid"><section class="panel"><h2>At a glance</h2><dl class="glance"><div><dt>Route</dt><dd>' + (t.stops?.length || 0) + ((t.stops?.length || 0) === 1 ? ' stop · ' : ' stops · ') + nightsOf(t) + ' nights on the ground</dd></div><div><dt>Budget</dt><dd>' + esc(budgetLabel(t)) + '</dd></div><div><dt>Known costs</dt><dd>' + (tot.map(x => money(x.known, x.currency) + ' known' + (x.unknown ? ', ' + x.unknown + ' unpriced' : '')).join('<br>') || 'None entered') + '</dd></div><div><dt>Next deadlines</dt><dd>' + (dl.map(d => esc(prettyDate(d.date)) + ' · ' + esc(d.title)).join('<br>') || 'None upcoming') + '</dd></div></dl>' +
      (t.status === 'On hold' ? '<p class="notice hold">Your condition: only when safe. Wanderlust does not decide when travel is safe. Review current advice, insurance, entry rules and transport for your dates first.</p>' : '') +
      '<div class="row wrap"><a class="btn primary" href="/prepare/trip:' + esc(t.id) + '">' + icon('download') + ' Prepare for offline</a><a class="btn ghost" href="/today?trip=' + esc(t.id) + '">' + icon('today') + ' Today view</a><button class="btn ghost" data-act="tripOfflinePage" data-id="' + esc(t.id) + '">Printable page</button><button class="btn ghost" data-act="tripCalendar" data-id="' + esc(t.id) + '">Deadlines to calendar</button></div></section>' +
      '<section class="panel"><h2>Journey details</h2><form data-form="tripSave" class="grid-form"><input type="hidden" name="id" value="' + esc(t.id) + '">' +
      field(['name', 'Name'], t.name, { required: true }) + field(['status', 'Stage', 'select', TRIP_STATUSES], t.status) + field(['startDate', 'Start date', 'date'], t.startDate) + field(['travellers', 'Travellers', 'number', [1, 20]], t.travellers, { hint: 'Blank means not decided.' }) +
      field(['budget', 'Budget', 'money'], t.budget, { hint: 'Blank means not set. 0 means a known zero.' }) + field(['budgetCurrency', 'Budget currency', 'select', CURRENCIES], t.budgetCurrency || 'AUD') + field(['budgetBasis', 'Budget covers', 'select', [['for the party', 'The whole party'], ['per person', 'Per person']]], t.budgetBasis || 'for the party') + field(['adviceChecked', 'Travel advice last checked', 'date'], t.adviceChecked) + field(['rewardPlan', 'Reward redemption', 'select', [['', 'Not planned'], 'Qantas Frequent Flyer', 'Velocity']], t.rewardPlan || '') +
      field(['scope', 'Countries and shape', 'textarea'], t.scope) + field(['notes', 'Notes, preferences and alternatives', 'textarea'], t.notes) + field(['nextAction', 'Next decision'], t.nextAction) + field(['bookingNotes', 'Booking notes', 'textarea'], t.bookingNotes) +
      '<div class="wide row between"><button type="button" class="btn ghost danger" data-act="tripDelete" data-id="' + esc(t.id) + '">' + icon('trash') + ' Delete journey</button><button class="btn primary">Save details</button></div></form></section></div>';
  }
  if (tab === 'route') {
    const places = store.list('place');
    return '<section class="panel"><h2>Stops</h2><p class="muted">In travel order. Nights exclude international flights and transfer-only days. Nothing here checks that a connection exists.</p><ol class="stops">' + (t.stops || []).map((s, i) => '<li><span class="step">' + (i + 1) + '</span><a href="/place/' + esc(s.id) + '">' + esc(s.name) + '</a><label class="nights"><span class="sr">Nights at ' + esc(s.name) + '</span><input type="number" min="1" max="90" value="' + s.nights + '" data-change="stopNights" data-trip="' + esc(t.id) + '" data-i="' + i + '" inputmode="numeric"> nights</label><span class="row"><button class="iconbtn" data-act="stopMove" data-trip="' + esc(t.id) + '" data-i="' + i + '" data-d="-1" aria-label="Move ' + esc(s.name) + ' earlier"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button><button class="iconbtn" data-act="stopMove" data-trip="' + esc(t.id) + '" data-i="' + i + '" data-d="1" aria-label="Move ' + esc(s.name) + ' later"' + (i === t.stops.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button><button class="iconbtn" data-act="stopRemove" data-trip="' + esc(t.id) + '" data-i="' + i + '" aria-label="Remove ' + esc(s.name) + '">' + icon('close') + '</button></span></li>').join('') + '</ol>' + (!t.stops?.length ? '<p class="muted empty-line">Your route is open. Add the first place you want to spend time.</p>' : '') +
      '<form class="row wrap" data-form="stopAdd"><input type="hidden" name="trip" value="' + esc(t.id) + '"><div class="field grow"><label for="sa">Place</label><select id="sa" name="place" required><option value="">Choose a place…</option>' + places.map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + ' — ' + esc(p.country) + '</option>').join('') + '</select></div><div class="field small"><label for="sn">Nights</label><input id="sn" name="nights" type="number" min="1" max="90" required inputmode="numeric"></div><button class="btn">Add stop</button></form>' +
      '<p class="muted small">Total: ' + (t.stops?.length || 0) + ((t.stops?.length || 0) === 1 ? ' stop · ' : ' stops · ') + nightsOf(t) + ' nights on the ground.</p><div id="routeMap" class="map route-map"></div><p class="muted small">Dashed lines show the order of stops only. They are not routes or directions.</p></section>' + flightsPanel(ctx, t) + section(ctx, t, 'legs');
  }
  if (tab === 'days') return section(ctx, t, 'days');
  if (tab === 'wallet') return section(ctx, t, 'bookings');
  if (tab === 'money') {
    const costs = store.list('cost', t.id), tot = costTotals(costs), bookings = store.records('bookings', t.id), edit = q.edit && costs.find(c => c.id === q.edit), adding = q.add === 'cost';
    const sameCur = tot.find(x => x.currency === (t.budgetCurrency || 'AUD'));
    const form = c => '<form class="grid-form record-form" data-form="costSave" id="form-cost"><input type="hidden" name="trip" value="' + esc(t.id) + '">' + (c ? '<input type="hidden" name="id" value="' + esc(c.id) + '">' : '') + '<h3 class="wide">' + (c ? 'Edit cost' : 'Add a cost') + '</h3>' +
      field(['item', 'Item'], c?.item, { required: true }) + field(['category', 'Category', 'select', CATEGORIES], c?.category || 'Other') + field(['state', 'Stage', 'select', STATES.map(s => [s, s[0].toUpperCase() + s.slice(1)])], c?.state || 'estimate') + field(['currency', 'Currency', 'select', CURRENCIES], c?.currency || t.budgetCurrency || 'AUD') + field(['total', 'Amount (likely)', 'money'], c?.total, { hint: 'Blank = unknown. 0 = genuinely free.' }) + field(['low', 'Low estimate', 'money'], c?.low, { hint: 'Estimates only. Blank uses the likely amount.' }) + field(['high', 'High estimate', 'money'], c?.high) + field(['paid', 'Paid so far', 'money'], c?.paid) + field(['basis', 'Amount is', 'select', [['for the party', 'For the whole party'], ['per person', 'Per person']]], c?.basis || 'for the party') + field(['segmentId', 'Leg', 'select', [['', 'Whole trip (not one leg)'], ...store.records('segments', t.id).map(l => [l.id, l.option + ': ' + l.title])]], c?.segmentId || '') + field(['paidBy', 'Paid by', 'select', [['', 'Not paid yet / not recorded'], ['me', 'You'], ['partner', 'Partner']]], c?.paidBy || '') + field(['split', 'Split', 'select', SPLITS], c?.split || 'leg', { hint: 'Following the leg: a You-only leg is Your; a leg Partner joins splits equally. Whole-trip costs need a choice.' }) + field(['shareMe', 'Your share or amount', 'number', [0, 100000000, 'any']], c?.shareMe) + field(['sharePartner', 'Your partner’s share or amount', 'number', [0, 100000000, 'any']], c?.sharePartner) + field(['myShare', 'Your share', 'money'], c?.myShare, { hint: 'Leave blank if not agreed. Shares are not assumed equal.' }) + field(['dueDate', 'Payment due', 'date'], c?.dueDate) + field(['bookingId', 'Linked booking', 'select', [['', 'None'], ...bookings.map(b => [b.id, b.title])]], c?.bookingId || '') + field(['url', 'Quote or booking link', 'url'], c?.url) +
      '<p class="form-error wide" role="alert"></p><div class="wide row end"><a class="btn ghost" href="?">Cancel</a><button class="btn primary">Save cost</button></div></form>';
    return '<section class="panel"><div class="row between"><div><h2>Money</h2><p class="muted">Each cost keeps its own currency. Totals are never converted, and unknown amounts are counted separately rather than as zero.</p></div>' + (!adding && !edit ? '<a class="btn" href="?add=cost#form-cost">' + icon('plus') + ' Add cost</a>' : '') + '</div>' +
      '<div class="totals">' + (tot.length ? tot.map(x => '<div class="total"><p class="eyebrow">' + esc(x.currency) + '</p><p class="big">' + money(x.known, x.currency) + '</p><p class="muted small">known across ' + (x.items - x.unknown) + ' of ' + x.items + ' items · ' + money(x.paid, x.currency) + ' paid' + (x.unknownPaid ? ' (' + x.unknownPaid + ' unknown)' : '') + '</p><p class="muted small">Your share entered: ' + money(x.myShare, x.currency) + (x.unknownShare ? ' · ' + x.unknownShare + ' not agreed' : '') + '</p></div>').join('') : '<p class="muted">No costs yet.</p>') +
      '<div class="total"><p class="eyebrow">Budget</p><p class="big">' + (isBlank(t.budget) ? '—' : money(t.budget, t.budgetCurrency || 'AUD')) + '</p><p class="muted small">' + esc(budgetLabel(t)) + (sameCur && !isBlank(t.budget) && t.budgetBasis !== 'per person' ? ' · ' + (sameCur.known > t.budget ? 'known costs exceed it' : money(t.budget - sameCur.known, sameCur.currency) + ' not yet allocated') : '') + '</p></div></div>' +
      '<div class="ranges">' + rangeTotals(costs).map(x => '<p><b>' + esc(x.currency) + '</b> low ' + money(x.low, x.currency) + ' · likely ' + money(x.likely, x.currency) + ' · high ' + money(x.high, x.currency) + (x.unknown ? ' · ' + x.unknown + ' unpriced' : '') + '</p>').join('') + '</div>' +
      (() => { const pp = perPerson(store, t); return '<div class="ranges"><p class="eyebrow">Per person</p>' + (Object.entries(pp.by).map(([cur, b]) => '<p><b>' + esc(cur) + '</b> You ' + money(Math.round(b.me * 100) / 100, cur) + ' · Partner ' + money(Math.round(b.partner * 100) / 100, cur) + '</p>').join('') || '<p class="muted">No priced costs yet.</p>') + (pp.undecided.length ? '<p class="flag-line">' + pp.undecided.length + ' cost(s) need “who it covers” before they count per person.</p>' : '') + '</div>'; })() +
      '<div id="audOut" class="aud"></div><div class="row"><button class="btn small ghost" data-act="showAUD" data-id="' + esc(t.id) + '">Show AUD estimate</button></div>' +
      (adding || edit ? form(edit) : '') + '<div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Category</th><th>Stage</th><th>Total</th><th>Paid</th><th>Basis</th><th>Your share</th><th>Due</th><th><span class="sr">Actions</span></th></tr></thead><tbody>' + costs.map(c => '<tr><th scope="row">' + esc(c.item || 'Untitled') + (c.bookingId ? '<small>Linked booking: ' + esc(store.get('bookings', c.bookingId)?.title || 'removed') + '</small>' : '') + '</th><td>' + esc(c.category || 'Other') + '</td><td>' + esc(c.state || 'estimate') + '</td><td>' + money(c.total, c.currency) + ((c.state || 'estimate') === 'estimate' && lineRange(c) && (lineRange(c).low !== c.total || lineRange(c).high !== c.total) ? '<small>' + money(lineRange(c).low, c.currency) + ' to ' + money(lineRange(c).high, c.currency) + '</small>' : '') + '</td><td>' + money(c.paid, c.currency) + '</td><td>' + esc(c.basis || 'for the party') + '</td><td>' + money(c.myShare, c.currency) + '</td><td>' + esc(c.dueDate ? prettyDate(c.dueDate) : '') + '</td><td class="row"><a class="iconbtn" href="?edit=' + esc(c.id) + '#form-cost" aria-label="Edit ' + esc(c.item) + '">' + icon('edit') + '</a><button class="iconbtn" data-act="costDelete" data-id="' + esc(c.id) + '" aria-label="Remove ' + esc(c.item) + '">' + icon('trash') + '</button></td></tr>').join('') + '</tbody></table></div></section>' +
      settleHTML(ctx, [t], t.id) +
      '<section class="panel"><h2>Savings for this trip</h2><div id="saveOut"><p class="muted">Contributions in AUD against the likely estimate. Press “Show AUD estimate” to compare.</p></div><ul class="plain">' + store.records('savings', t.id).sort((a, b) => b.date.localeCompare(a.date)).map(s => '<li class="row between"><span>' + esc(prettyDate(s.date)) + ' · ' + money(Number(s.amount), 'AUD') + (s.who ? ' · ' + esc(s.who) : '') + '</span><button class="iconbtn" data-act="recordDelete" data-kind="savings" data-id="' + esc(s.id) + '" aria-label="Remove contribution">' + icon('trash') + '</button></li>').join('') + '</ul><form class="row wrap" data-form="saveAdd"><input type="hidden" name="trip" value="' + esc(t.id) + '"><div class="field"><label for="sv-d">Date</label><input id="sv-d" name="date" type="date" required></div><div class="field"><label for="sv-a">Amount (AUD)</label><input id="sv-a" name="amount" type="number" min="0" step="any" required></div><div class="field"><label for="sv-w">Who</label><select id="sv-w" name="who"><option>You</option><option>Partner</option><option>Both</option></select></div><button class="btn">Add contribution</button></form></section>';
  }
  if (tab === 'tasks') {
    const tasks = store.list('task', t.id), dl = deadlines(store, t.id), today = todayISO();
    return '<section class="panel"><h2>To do</h2><ul class="tasks">' + tasks.map(x => '<li><label class="check"><input type="checkbox" data-change="taskToggle" data-id="' + esc(x.id) + '"' + (x.done ? ' checked' : '') + '> <span>' + esc(x.text) + (x.due ? ' <small>due ' + esc(prettyDate(x.due)) + '</small>' : '') + '</span></label><button class="iconbtn" data-act="taskDelete" data-id="' + esc(x.id) + '" aria-label="Remove task">' + icon('trash') + '</button></li>').join('') + '</ul>' +
      '<div class="row wrap"><label class="sr" for="pk">Packing template</label><select id="pk">' + Object.keys(PACKING).map(k => '<option>' + k + '</option>').join('') + '</select><button class="btn small ghost" data-act="packingAdd" data-trip="' + esc(t.id) + '">Add packing list</button></div>' + '<form class="row wrap" data-form="taskAdd"><input type="hidden" name="trip" value="' + esc(t.id) + '"><div class="field grow"><label for="nt">New task</label><input id="nt" name="text" required maxlength="400"></div><div class="field"><label for="nd">Due (optional)</label><input id="nd" name="due" type="date"></div><button class="btn">Add task</button></form></section>' +
      '<section class="panel"><div class="row between"><h2>Every deadline</h2><button class="btn ghost" data-act="tripCalendar" data-id="' + esc(t.id) + '">Export to calendar (.ics)</button></div><p class="muted">Collected from costs, tasks, bookings, research reviews and reminders. Wanderlust shows these when open; it does not send device notifications.</p><ul class="deadlines">' + (dl.map(d => '<li class="' + (d.date < today ? 'overdue' : d.date === today ? 'due-today' : '') + '"><span class="date">' + esc(prettyDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' })) + '</span><span>' + esc(d.kind) + ' · ' + esc(d.title) + '</span>' + (d.date < today ? '<span class="flag">overdue</span>' : '') + '</li>').join('') || '<li class="muted">No dated deadlines yet.</li>') + '</ul></section>' + section(ctx, t, 'reminders');
  }
  if (tab === 'research') return '<section class="panel"><h2>Health and entry checklist</h2><p class="muted small">Not medical or legal advice. Each item links to an official starting point; record what you confirm and when. Ask a travel doctor about vaccinations, malaria and altitude for your exact route.</p><button class="btn small" data-act="healthAdd" data-trip="' + esc(t.id) + '">Add the checklist to Findings</button></section>' + '<section class="panel"><div class="row between"><div><h2>Research with ChatGPT</h2><p class="muted">Research happens in ChatGPT through your connected Wanderlust tools, which save findings with sources. It needs a connection; this device does not run an AI model.</p></div><div class="row"><button class="btn ghost" data-act="tripBrief" data-id="' + esc(t.id) + '">Download brief</button>' + ext('https://www.smartraveller.gov.au/', 'Travel advice') + '</div></div></section>' + section(ctx, t, 'preferences') + section(ctx, t, 'requests') + section(ctx, t, 'research') + section(ctx, t, 'contacts') + section(ctx, t, 'phrases');
  if (tab === 'together') return section(ctx, t, 'votes');
  if (tab === 'journal') return '<p class="row"><a class="btn" href="/journeys/' + esc(t.id) + '/chapter">' + icon('story') + ' The chapter page</a></p>' + section(ctx, t, 'journal');
  if (tab === 'chapter') {
    const js = store.records('journal', t.id).sort((a, b) => (a.date || '').localeCompare(b.date || '')), places = ctx.FORTY.entries.filter(e => store.get('fortyEntry', e.id)?.tripId === t.id);
    return '<article class="chapter"><p class="eyebrow">A chapter of Wanderlust</p><h2 class="chapter-title">' + esc(t.name) + '</h2><p class="lede">' + esc(t.windowStart ? windowLabel(t.windowStart, t.windowEnd) : '') + (places.length ? ' · ' + esc(places.map(e => e.name).join(' · ')) : '') + '</p>' +
      (js.length ? js.map(j => '<section class="chapter-day">' + (j.file && j.filetype?.startsWith('image/') ? '<img class="att-img" data-file="' + esc(j.file) + '" alt="' + esc(j.title) + '">' : '') + '<p class="eyebrow">' + esc([j.date && prettyDate(j.date), j.location, j.weather].filter(Boolean).join(' · ')) + '</p><h3>' + esc(j.title) + '</h3>' + (j.mood ? '<p class="pill">' + esc(j.mood) + '</p>' : '') + (j.notes ? '<p class="notes">' + esc(j.notes) + '</p>' : '') + '</section>').join('') : '<p class="muted">Journal entries from this trip become its chapter.</p>') +
      '<p class="row"><button class="btn" data-act="print">' + icon('download') + ' Print or save as PDF</button></p></article>';
  }
  return '';
}

export const view = {
  render(ctx) {
    const t = ctx.store.get('trip', ctx.route.params.id), tab = ctx.route.params.tab || 'overview';
    if (!t) return { title: 'Journey not found', html: '<section class="page narrow"><h1>This journey is not on this device.</h1><p>It may have been deleted on another device.</p><a class="btn" href="/journeys">Journeys</a></section>' };
    return {
      title: t.name, screen: 'trip',
      html: '<header class="trip-head">' + (ctx.PHOTOS[t.theme] ? photo(ctx.PHOTOS, t.theme, { eager: true }) : '<div class="photo none drawn">' + compass + '</div>') + '<div class="trip-title"><a class="back" href="/journeys">' + icon('back') + ' Journeys</a><p class="eyebrow">' + pill(t.status, statusTone(t.status)) + (t.startDate ? ' · ' + esc(prettyDate(t.startDate)) : '') + '</p><h1>' + esc(t.name) + '</h1><p class="lede">' + esc(t.scope || '') + '</p></div></header>' +
        '<nav class="tabs" aria-label="Journey sections"><div class="tabs-in">' + TABS.map(([k, l]) => '<a href="/journeys/' + esc(t.id) + (k === 'overview' ? '' : '/' + k) + '"' + (tab === k ? ' aria-current="page"' : '') + '>' + l + '</a>').join('') + '</div></nav>' +
        '<div class="page trip-body">' + tabBody(ctx, t, tab) + '</div>',
      async mount(root) {
        for (const img of root.querySelectorAll('img[data-file]')) fileURL(ctx.store, ctx.sync, img.dataset.file).then(u => { img.src = u; }).catch(() => img.replaceWith(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'Photo not downloaded to this device yet. Prepare this journey for offline while connected.' })));
        for (const a of root.querySelectorAll('a[data-file-link]')) fileURL(ctx.store, ctx.sync, a.dataset.fileLink).then(u => { a.href = u; }).catch(() => { a.removeAttribute('href'); a.classList.add('missing'); a.title = 'Not downloaded to this device yet'; });
        const target = ctx.route.query.open && root.querySelector('#r-' + CSS.escape(ctx.route.query.open)); if (target) target.scrollIntoView({ block: 'center' });
        if ((ctx.route.query.add || ctx.route.query.edit) && location.hash) root.querySelector(location.hash)?.querySelector('input,select,textarea')?.focus();
        const el = root.querySelector('#routeMap');
        if (el) {
          const pts = (t.stops || []).map(s => ctx.store.get('place', s.id)).filter(Boolean);
          if (!pts.length) { el.remove(); return; }
          try { const m = await createMap(el, { assetBase: ctx.A, store: ctx.store, label: 'Map of stops for ' + t.name }); ctx.cleanups.push(() => m.destroy()); await m.setPins(pts.map((p, i) => ({ id: p.id, name: (i + 1) + '. ' + p.name, lat: p.lat, lon: p.lon, color: PIN(p.status), big: true })), id => ctx.nav('/place/' + id)); await m.setRoute(pts); m.fit(pts); }
          catch (e) { el.innerHTML = '<p class="map-fail">Map unavailable on this device. Stops are listed above.</p>'; }
        }
      },
    };
  },
};

const today = () => todayISO();
// A memory at one of the forty: offer to mark it visited, with the date and a cover photo.
async function offerVisited(ctx, row) {
  const p = ctx.store.get('place', row.placeId), e = ctx.FORTY.entries.find(x => x.placeId === row.placeId);
  if (!p || p.status === 'Visited' || !e) return;
  if (!await confirmDialog('Mark ' + e.name + ' as visited?', { ok: 'Mark visited', cancel: 'Not yet', detail: 'Sets the date to ' + (row.date || 'today') + (row.file && row.filetype?.startsWith('image/') ? ' and uses this photo as its cover' : '') + '. Your forty counter updates.' })) return;
  await ctx.store.patch('place', p.id, { status: 'Visited' });
  const pe = ctx.store.get('fortyEntry', e.id), set = { completedOn: row.date || todayISO(), ...(row.file && row.filetype?.startsWith('image/') ? { coverFile: row.file } : {}) };
  if (pe) await ctx.store.patch('fortyEntry', e.id, set); else await ctx.store.create('fortyEntry', set, undefined, e.id);
}
function validateRecord(kind, row) {
  const s = SCHEMAS[kind];
  for (const [name, label, , , required] of s.fields) if (required && !row[name]) throw new Error('Add ' + label.toLowerCase() + '.');
  if (row.end && row.date && row.end < row.date) throw new Error('The end date must be on or after the start date.');
  if (row.arriveDate && row.date && row.arriveDate < row.date) throw new Error('Arrival cannot be before departure (dates are local to each end).');
  if (row.checked && row.checked > today()) throw new Error('A checked date cannot be in the future.');
  for (const k of ['url', 'source']) if (row[k] && !/^https:\/\//i.test(row[k])) throw new Error('Use an https:// link.');
  if (row.status === 'Confirmed from source' && (!row.url || !row.checked)) throw new Error('A confirmed finding needs a source link and a checked date.');
  for (const z of ['tz', 'departTz', 'arriveTz']) if (row[z] && !validZone(row[z])) throw new Error('“' + row[z] + '” is not a recognised time zone. Try a city zone like Europe/Oslo.');
}

export const forms = {
  async recordSave(f, ctx) {
    const v = formValues(f), kind = v._kind, trip = v._trip, id = v._id;
    const row = { trip };
    for (const [name] of SCHEMAS[kind].fields) row[name] = v[name] === null || v[name] === undefined ? '' : String(v[name]);
    validateRecord(kind, row);
    let file = f.attachment?.files?.[0];
    if (file && kind === 'journal') { const { compressImage } = await import('../../core/vault.js'); file = await compressImage(file); }
    if (file) Object.assign(row, fileFields(await addFile(ctx.store, file)));
    if (id) await ctx.store.patch(kind, id, row);
    else await ctx.store.create(kind, { id: newId(kind.replace(/s$/, '')), ...row });
    f.removeAttribute('data-dirty');
    if (kind === 'journal' && row.placeId) await offerVisited(ctx, row);
    ctx.nav(location.pathname, { replace: true }); toast('Saved on this device');
  },
  async tripSave(f, ctx) {
    const v = formValues(f), id = v.id; delete v.id;
    if (v.travellers !== null && (!Number.isInteger(v.travellers) || v.travellers < 1 || v.travellers > 20)) throw new Error('Use 1–20 travellers, or leave it blank.');
    if (v.budget !== null && v.budget < 0) throw new Error('Budgets cannot be negative.');
    await ctx.store.patch('trip', id, v); toast('Journey saved on this device');
  },
  async stopAdd(f, ctx) {
    const v = formValues(f), t = ctx.store.get('trip', v.trip), p = ctx.store.get('place', v.place);
    if (!p) throw new Error('Choose a place.'); if (!Number.isInteger(v.nights) || v.nights < 1 || v.nights > 90) throw new Error('Use 1–90 nights.');
    await ctx.store.patch('trip', t.id, { stops: [...(t.stops || []), { id: p.id, name: p.name, nights: v.nights }] });
  },
  async saveAdd(f, ctx) { const v = formValues(f); if (!(v.amount >= 0)) throw new Error('Enter an amount.'); await ctx.store.create('savings', { id: newId('saving'), trip: v.trip, date: v.date, amount: String(v.amount), who: v.who, note: '' }); f.reset(); toast('Contribution saved'); },
  async costSave(f, ctx) {
    const v = formValues(f), trip = v.trip, id = v.id; delete v.trip; delete v.id;
    for (const k of ['total', 'paid', 'myShare', 'low', 'high']) if (v[k] !== null && v[k] < 0) throw new Error('Amounts cannot be negative.');
    if (v.split === 'exact' && v.total !== null && Math.abs((v.shareMe || 0) + (v.sharePartner || 0) - v.total) > 0.005) throw new Error('Exact amounts must add up to the total.');
    if (v.split === 'leg' && !v.segmentId) v.split = '';
    if (v.low !== null && v.high !== null && v.low > v.high) throw new Error('The low estimate must not be above the high one.');
    if (v.url && !/^https:\/\//.test(v.url)) throw new Error('Use an https:// link.');
    if (id) await ctx.store.patch('cost', id, v, trip); else await ctx.store.create('cost', { id: newId('cost'), ...v }, trip);
    if (v.bookingId) { const b = ctx.store.get('bookings', v.bookingId); const cid = id || ctx.store.list('cost', trip).at(-1).id; if (b && b.costId !== cid) await ctx.store.patch('bookings', b.id, { costId: cid }); }
    f.removeAttribute('data-dirty'); ctx.nav(location.pathname, { replace: true }); toast('Cost saved');
  },
  async taskAdd(f, ctx) { const v = formValues(f); await ctx.store.create('task', { id: newId('task'), text: v.text, done: false, due: v.due || '' }, v.trip); f.reset(); },
};

export const actions = {
  async packingAdd(el, ctx) { const k = document.getElementById('pk').value, have = new Set(ctx.store.list('task', el.dataset.trip).map(x => x.text)); const ops = PACKING[k].filter(x => !have.has('Pack: ' + x)).map(x => ctx.store.createOp('task', { id: newId('task'), text: 'Pack: ' + x, done: false, due: '' }, el.dataset.trip)); await ctx.store.commit(ops); toast(ops.length + ' packing items added'); },
  async healthAdd(el, ctx) { const have = new Set(ctx.store.records('research', el.dataset.trip).map(r => r.title)); const ops = HEALTH.filter(([, t]) => !have.has(t)).map(([topic, title, url]) => ctx.store.createOp('research', { id: newId('research'), trip: el.dataset.trip, topic, title, status: 'Needs checking', url, checked: '', review: '', notes: '' })); await ctx.store.commit(ops); toast(ops.length + ' checklist items added to Findings'); },
  async showAUD(el, ctx) { const t = ctx.store.get('trip', el.dataset.id), rates = await getRates(ctx); document.getElementById('audOut').innerHTML = audBlock(toAUD(rangeTotals(ctx.store.list('cost', t.id)), rates), rates); const sp = savingsPlan(ctx.store, t, rates), o = document.getElementById('saveOut'); if (o && rates) o.innerHTML = '<p>Saved ' + money(sp.saved, 'AUD') + ' of about ' + money(Math.round(sp.target), 'AUD') + ' (likely, estimated).' + (sp.perMonth != null ? ' About ' + money(Math.round(sp.perMonth), 'AUD') + ' a month to be ready by the window.' : '') + (sp.complete ? '' : ' Some costs are unpriced or have no rate, so the real figure will be higher.') + '</p>'; },
  async segPartner(el, ctx) { await ctx.store.patch('segments', el.dataset.id, { partner: el.value }); toast('Saved: Partner ' + el.value); },
  async fortyMove(el, ctx) { const pe = ctx.store.get('fortyEntry', el.dataset.entry); if (pe) await ctx.store.patch('fortyEntry', el.dataset.entry, { tripId: el.value }); else await ctx.store.create('fortyEntry', { tripId: el.value }, undefined, el.dataset.entry); toast('Moved. Season and deadline checks updated.'); },
  async planAdd(el, ctx) { const m = new Date(); m.setMonth(m.getMonth() + 6); const ym = m.toISOString().slice(0, 7); await ctx.store.patch('trip', el.dataset.id, { planId: 'my-plan', windowStart: ctx.store.get('trip', el.dataset.id).windowStart || ym, windowEnd: ctx.store.get('trip', el.dataset.id).windowEnd || ym }); toast('Added to the plan. Set its months below.'); },
  async tripWindow(el, ctx) { if (el.value && !/^\d{4}-\d{2}$/.test(el.value)) return; await ctx.store.patch('trip', el.dataset.id, { [el.dataset.field]: el.value }); },
  async recordDelete(el, ctx) {
    const r = ctx.store.get(el.dataset.kind, el.dataset.id);
    if (!await confirmDialog('Remove this ' + SCHEMAS[el.dataset.kind].noun + '?', { ok: 'Remove', danger: true, detail: r?.file ? 'Its attached file is removed from the cloud after the change syncs.' : '' })) return;
    await ctx.store.remove(el.dataset.kind, el.dataset.id); toast('Removed');
  },
  async costDelete(el, ctx) { if (await confirmDialog('Remove this cost?', { ok: 'Remove', danger: true })) await ctx.store.remove('cost', el.dataset.id); },
  async taskToggle(el, ctx) { await ctx.store.patch('task', el.dataset.id, { done: el.checked }); },
  async taskDelete(el, ctx) { await ctx.store.remove('task', el.dataset.id); },
  async stopNights(el, ctx) { const t = ctx.store.get('trip', el.dataset.trip), n = +el.value; if (!Number.isInteger(n) || n < 1 || n > 90) { toast('Use 1–90 nights.'); el.value = t.stops[+el.dataset.i].nights; return; } const stops = t.stops.map((s, i) => i === +el.dataset.i ? { ...s, nights: n } : s); await ctx.store.patch('trip', t.id, { stops }); },
  async stopMove(el, ctx) { const t = ctx.store.get('trip', el.dataset.trip), i = +el.dataset.i, j = i + +el.dataset.d, stops = [...t.stops]; [stops[i], stops[j]] = [stops[j], stops[i]]; await ctx.store.patch('trip', t.id, { stops }); },
  async stopRemove(el, ctx) { const t = ctx.store.get('trip', el.dataset.trip); await ctx.store.patch('trip', t.id, { stops: t.stops.filter((_, i) => i !== +el.dataset.i) }); },
  async tripDelete(el, ctx) {
    const t = ctx.store.get('trip', el.dataset.id);
    if (['russia-rail', 'iran', 'forty-before-forty'].includes(t.id) && !await confirmDialog('This is one of your original journey workspaces.', { ok: 'I understand', detail: 'Deleting removes its notes and conditions. A full backup keeps a copy.' })) return;
    if (!await confirmDialog('Delete ' + t.name + '?', { ok: 'Delete journey', danger: true, detail: 'Its costs and tasks are deleted with it. Planning records (days, bookings, journal) stay in your data and in backups.' })) return;
    const ops = [...ctx.store.list('cost', t.id).map(c => ctx.store.removeOp('cost', c.id)), ...ctx.store.list('task', t.id).map(x => ctx.store.removeOp('task', x.id)), ctx.store.removeOp('trip', t.id)];
    await ctx.store.commit(ops); ctx.nav('/journeys', { replace: true });
  },
  tripBrief(el, ctx) { download('Wanderlust-' + el.dataset.id + '-research-brief.txt', researchBrief(ctx.store, el.dataset.id), 'text/plain;charset=utf-8'); },
  tripOfflinePage(el, ctx) { download('Wanderlust-' + el.dataset.id + '.html', offlineTripHTML(ctx.store, el.dataset.id), 'text/html;charset=utf-8'); },
  tripCalendar(el, ctx) { const c = calendarICS(ctx.store, el.dataset.id); download('Wanderlust-deadlines.ics', c.body, 'text/calendar;charset=utf-8'); toast(c.count + ' deadlines exported. Import into your calendar for alerts.'); },
};

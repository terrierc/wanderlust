import { esc, icon, photo, pill, statusTone, field, formValues, ext, confirmDialog, toast } from '../kit.js';
import { PLACE_STATUSES } from '../../core/model.js';
import { newId } from '../../core/store.js';
import { countryMatch, fortyModel, WISH } from '../../core/domain.js';

const REGIONS = 'Africa|Antarctica|Asia|Europe|North America|Oceania|South America|South Atlantic|Other';
const CHECKS = ['Entry rules and passport checked', 'Travel advice and insurance reviewed', 'Accommodation booked', 'Transport connections confirmed', 'Permits and timed tickets booked', 'Weather and access checked'];
const label = s => s === 'Unconfirmed' ? 'To discover' : s;

export const view = {
  render(ctx) {
    const { store, route } = ctx, p = store.get('place', route.params.id);
    if (!p) return { title: 'Place not found', html: '<section class="page narrow"><h1>This place is not in your atlas.</h1><p>It may have been removed on another device.</p><a class="btn" href="/">Back to Explore</a></section>' };
    const f = fortyModel(store, ctx.FORTY), entries = f.entries.filter(e => e.placeId === p.id);
    const trips = store.list('trip').filter(t => (t.stops || []).some(s => s.id === p.id));
    const country = store.list('country').find(c => countryMatch(p, c));
    const ph = ctx.PHOTOS[p.id], outline = !!p.researchOutline;
    const steps = (p.route || []).map((r, i) => '<li><span class="step">' + String(i + 1).padStart(2, '0') + '</span><div><strong>' + esc(Array.isArray(r) ? r[0] : r) + '</strong>' + (Array.isArray(r) && r.length > 1 ? '<p>' + esc(r.slice(1).join(' · ')) + '</p>' : '') + (p.stepNotes?.[i] ? '<p class="mine">' + icon('edit') + ' ' + esc(p.stepNotes[i]) + '</p>' : '') + '</div></li>').join('');
    const legacy = p.dayEdits && Object.values(p.dayEdits).some(Boolean) ? '<details class="legacy"><summary>Your saved day notes from the earlier planner (' + Object.values(p.dayEdits).filter(Boolean).length + ')</summary><ol>' + Object.entries(p.dayEdits).filter(([, v]) => v).map(([i, v]) => '<li value="' + (+i + 1) + '">' + esc(v) + '</li>').join('') + '</ol></details>' : '';
    return {
      title: p.name, screen: 'place',
      html: '<article class="place">' +
        '<header class="place-hero">' + (ph ? photo(ctx.PHOTOS, p.id, { eager: true, caption: true }) : '<div class="photo none">' + '<span>No licensed photograph is bundled for this place.</span></div>') +
        '<div class="place-title"><a class="back" href="/">' + icon('back') + ' Atlas</a><p class="eyebrow">' + esc([p.country, p.region, p.category].filter(Boolean).join(' · ')) + '</p><h1>' + esc(p.name) + '</h1>' + (p.why ? '<p class="lede">' + esc(p.why) + '</p>' : '') + '</div></header>' +
        '<div class="page place-grid"><div class="col-main">' +
        '<section class="panel"><h2>Your relationship with this place</h2>' +
        '<form class="status-form" data-form="placeStatus" data-live="1"><fieldset><legend>Visit status for this place</legend><div class="chips">' + PLACE_STATUSES.map(s => '<label class="chip"><input type="radio" name="status" value="' + s + '"' + ((p.status || 'Unconfirmed') === s ? ' checked' : '') + ' data-change="placeStatus" data-id="' + esc(p.id) + '"><span>' + label(s) + '</span></label>').join('') + '</div></fieldset>' +
        '<p class="muted small">' + (WISH.includes(p.status) ? 'On your wishlist. ' : '') + 'A country visit never marks individual sights as visited.' + (country ? ' Country history: <a href="/story/' + encodeURIComponent(country.code) + '">' + esc(country.name) + ' · ' + esc(country.status) + '</a>.' : '') + '</p>' +
        '<div class="field inline"><label for="pp">Priority</label><select id="pp" data-change="placeField" data-id="' + esc(p.id) + '" data-field="priority">' + ['Explore', 'Someday', 'High', 'Next trip'].map(x => '<option' + (p.priority === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div></form>' +
        (entries.length ? entries.map(e => { const g = f.groupOf(e); return '<a class="link-card" href="/forty/' + esc(e.id) + '">' + icon('forty') + '<span><strong>' + (g === 'core' ? 'Slot ' + f.slot(e) + ' in your forty' : g === 'optional' ? 'Optional in your forty' : g === 'completed' ? 'Completed forty experience' : 'Conditional reserve') + '</strong><small>' + esc(e.experience) + '</small></span>' + icon('arrow') + '</a>'; }).join('') : '') +
        '<div class="sub"><h3>Journeys</h3>' + (trips.length ? '<ul class="plain">' + trips.map(t => '<li><a href="/journeys/' + esc(t.id) + '/route">' + esc(t.name) + '</a> · ' + esc(t.status) + '</li>').join('') + '</ul>' : '<p class="muted">Not part of a journey yet.</p>') +
        '<form class="row" data-form="addToTrip"><input type="hidden" name="place" value="' + esc(p.id) + '"><div class="field"><label for="att">Add to journey</label><select id="att" name="trip">' + store.list('trip').map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') + '</select></div><div class="field small"><label for="atn">Nights</label><input id="atn" name="nights" type="number" min="1" max="90" required inputmode="numeric"></div><button class="btn">Add stop</button></form></div></section>' +
        (store.list('journal').some(j => j.placeId === p.id) ? '<section class="panel"><h2>Your memories here</h2><ul class="memories">' + store.list('journal').filter(j => j.placeId === p.id).map(j => '<li><a href="/journeys/' + esc(j.trip) + '/journal?open=' + esc(j.id) + '">' + (j.file && j.filetype?.startsWith('image/') ? '<img data-file="' + esc(j.file) + '" alt="' + esc(j.title) + '">' : '') + '<span><strong>' + esc(j.title) + '</strong><small>' + esc(j.date || '') + '</small></span></a></li>').join('') + '</ul></section>' : '') +
        '<section class="panel"><h2>' + (outline ? 'Research outline' : 'Editorial outline') + '</h2><p class="notice">' + (outline ? 'A starting list of things to research. It is not an itinerary, and no duration has been recommended.' : 'A reusable editorial sketch, not a verified plan for your dates. Check access, opening times and transport before relying on it.') + '</p><ol class="steps">' + (steps || '<li>No outline yet.</li>') + '</ol>' + legacy +
        '<form data-form="stepNote" class="row"><input type="hidden" name="id" value="' + esc(p.id) + '"><div class="field"><label for="sn-i">Add a note to step</label><select id="sn-i" name="index">' + (p.route || []).map((_, i) => '<option value="' + i + '">' + (i + 1) + '</option>').join('') + '</select></div><div class="field grow"><label for="sn-t">Your note</label><input id="sn-t" name="text" maxlength="2000"></div><button class="btn">Save note</button></form></section>' +
        '<section class="panel"><h2>Your plan for this place</h2><form data-form="placePlan" class="grid-form"><input type="hidden" name="id" value="' + esc(p.id) + '">' +
        field(['startDate', 'Arrival date', 'date'], p.startDate) + field(['tripNights', outline ? 'Draft nights (not a recommendation)' : 'Your nights', 'number', [1, 60]], p.tripNights) + field(['pace', 'Pace', 'select', 'Unhurried|Balanced|Active'], p.pace || 'Unhurried') + field(['people', 'Travellers', 'number', [1, 20]], p.people) + field(['budget', 'Budget for this place (AUD, for the party)', 'money'], p.budget) + field(['interest', 'Interest', 'select', 'Nature and culture|Nature and hiking|Art and architecture|Food and slow travel|Wildlife|Beaches and rest'], p.interest || 'Nature and culture') + field(['notes', 'Your wishes, access needs and notes', 'textarea'], p.notes) +
        '<fieldset class="wide"><legend>Before you go</legend><div class="checks">' + CHECKS.map((c, i) => '<label class="check"><input type="checkbox" name="check' + i + '"' + (p.checks?.[i] ? ' checked' : '') + '> <span>' + c + '</span></label>').join('') + '</div></fieldset><div class="wide row end"><button class="btn primary">Save plan</button></div></form></section>' +
        '</div><aside class="col-side"><section class="facts"><h2 class="sr">Practical details</h2><dl>' +
        '<div><dt>Suggested season</dt><dd>' + esc(p.season || 'To research') + '</dd></div>' +
        '<div><dt>Suggested stay</dt><dd>' + (outline ? 'Not researched yet' : esc(p.nights) + ' nights on the ground, plus travel days') + '</dd></div>' +
        '<div><dt>Stay around</dt><dd>' + esc(p.base || 'To research') + '</dd></div><div><dt>Getting there</dt><dd>' + esc(p.arrival || 'To research') + '</dd></div><div><dt>Getting around</dt><dd>' + esc(p.transport || 'To research') + '</dd></div>' +
        '<div><dt>Map position</dt><dd>Approximate: ' + Math.abs(p.lat).toFixed(2) + '°' + (p.lat < 0 ? 'S' : 'N') + ', ' + Math.abs(p.lon).toFixed(2) + '°' + (p.lon < 0 ? 'W' : 'E') + '. Not a trailhead, hotel or navigation point.</dd></div></dl>' +
        '<p class="muted small">' + esc(p.provenance || 'Added by you.') + '</p></section>' +
        '<section class="links"><h2>Research</h2>' + ext(p.source, 'Official reference') + ext('https://www.smartraveller.gov.au/', 'Current travel advice') + ext('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name + ' ' + p.country), 'Look up on Google Maps') + '</section>' +
        '<div class="row"><a class="btn ghost" href="/place/' + esc(p.id) + '/edit">' + icon('edit') + ' Edit details</a><button class="btn ghost danger" data-act="deletePlace" data-id="' + esc(p.id) + '">' + icon('trash') + ' Remove</button></div></aside></div></article>',
    };
  },
};

export const editPlaceholder = {};
export const edit = {
  render(ctx) {
    const id = ctx.route.params.id, p = id ? ctx.store.get('place', id) : null;
    if (id && !p) return { title: 'Not found', html: '<section class="page narrow"><h1>This place is not in your atlas.</h1></section>' };
    const v = p || { status: 'Want to go', region: 'Europe', category: 'Personal', nights: 4 };
    return {
      title: p ? 'Edit ' + p.name : 'Add a place', screen: 'form',
      html: '<section class="page narrow"><a class="back" href="' + (p ? '/place/' + esc(p.id) : '/') + '">' + icon('back') + ' ' + (p ? esc(p.name) : 'Atlas') + '</a><h1>' + (p ? 'Edit details' : 'Add a place') + '</h1>' +
        '<form data-form="placeSave" class="grid-form">' + (p ? '<input type="hidden" name="id" value="' + esc(p.id) + '">' : '') +
        field(['name', 'Place name'], v.name, { required: true }) + field(['country', 'Country or countries'], v.country, { required: true }) + field(['region', 'Continent', 'select', REGIONS], v.region) + field(['category', 'Kind of place'], v.category) +
        field(['lat', 'Map latitude', 'number', [-90, 90, 'any']], v.lat, { required: true, hint: 'An approximate marker for the map, e.g. from a map app.' }) + field(['lon', 'Map longitude', 'number', [-180, 180, 'any']], v.lon, { required: true }) +
        field(['status', 'Visit status', 'select', PLACE_STATUSES.map(s => [s, label(s)])], v.status) + field(['nights', p ? 'Suggested nights' : 'Draft nights (not a recommendation)', 'number', [1, 60]], v.nights, { required: true }) +
        field(['season', 'Season notes'], v.season) + field(['base', 'Where to stay (area)'], v.base) + field(['arrival', 'Getting there'], v.arrival) + field(['transport', 'Getting around'], v.transport) +
        field(['why', 'What draws you here?', 'textarea'], v.why) + field(['source', 'Official reference (https://)', 'url'], v.source) +
        '<p class="form-error wide" role="alert"></p><div class="wide row end"><a class="btn ghost" href="' + (p ? '/place/' + esc(p.id) : '/') + '">Cancel</a><button class="btn primary">' + (p ? 'Save details' : 'Add to my atlas') + '</button></div></form></section>',
    };
  },
};

export const actions = {
  async placeStatus(el, ctx) { await ctx.store.patch('place', el.dataset.id, { status: el.value }); toast('Saved on this device'); },
  async placeField(el, ctx) { await ctx.store.patch('place', el.dataset.id, { [el.dataset.field]: el.value }); toast('Saved on this device'); },
  async deletePlace(el, ctx) {
    const p = ctx.store.get('place', el.dataset.id);
    const inForty = fortyModel(ctx.store, ctx.FORTY).entries.some(e => e.placeId === p.id);
    if (inForty) { toast('This place is linked to your The forty. Swap or keep it there; its planner cannot be removed.'); return; }
    if (!await confirmDialog('Remove ' + p.name + ' from your atlas?', { ok: 'Remove', danger: true, detail: 'Journeys that include it keep their stop name. You can re-add it later; a full backup keeps a copy.' })) return;
    await ctx.store.remove('place', p.id); ctx.nav('/', { replace: true }); toast(p.name + ' removed');
  },
};
export const forms = {
  async placeStatus() {},
  async addToTrip(f, ctx) {
    const v = formValues(f), p = ctx.store.get('place', v.place), t = ctx.store.get('trip', v.trip);
    if (!Number.isInteger(v.nights) || v.nights < 1 || v.nights > 90) throw new Error('Use 1–90 nights.');
    await ctx.store.patch('trip', t.id, { stops: [...(t.stops || []), { id: p.id, name: p.name, nights: v.nights }] });
    toast('Added to ' + t.name);
  },
  async stepNote(f, ctx) {
    const v = formValues(f), p = ctx.store.get('place', v.id);
    await ctx.store.patch('place', p.id, { stepNotes: { ...(p.stepNotes || {}), [v.index]: v.text } }); toast('Note saved'); f.reset();
  },
  async placePlan(f, ctx) {
    const v = formValues(f), checks = {};
    for (let i = 0; i < CHECKS.length; i++) { checks[i] = v['check' + i]; delete v['check' + i]; }
    const id = v.id; delete v.id;
    if (v.tripNights !== null && (!Number.isInteger(v.tripNights) || v.tripNights < 1 || v.tripNights > 60)) throw new Error('Use 1–60 nights, or leave it blank.');
    if (v.people !== null && (!Number.isInteger(v.people) || v.people < 1 || v.people > 20)) throw new Error('Use 1–20 travellers, or leave it blank.');
    await ctx.store.patch('place', id, { ...v, checks }); toast('Plan saved on this device');
  },
  async placeSave(f, ctx) {
    const v = formValues(f);
    if (v.source && !/^https:\/\//.test(v.source)) throw new Error('Use an https:// link for the reference.');
    if (v.lat === null || v.lon === null || Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180) throw new Error('Enter a latitude (−90 to 90) and longitude (−180 to 180).');
    if (!Number.isInteger(v.nights) || v.nights < 1 || v.nights > 60) throw new Error('Use 1–60 nights.');
    if (v.id) { const id = v.id; delete v.id; await ctx.store.patch('place', id, v); ctx.nav('/place/' + id, { replace: true }); toast('Saved'); return; }
    const p = { ...v, id: newId('custom'), priority: 'Explore', season: v.season || 'To research', base: v.base || v.name, arrival: v.arrival || 'To research', transport: v.transport || 'To research', source: v.source || 'https://www.smartraveller.gov.au/', route: [], researchOutline: true, notes: '', provenance: 'Added by you; needs research.' };
    await ctx.store.create('place', p); ctx.nav('/place/' + p.id, { replace: true }); toast(p.name + ' added to your atlas');
  },
};

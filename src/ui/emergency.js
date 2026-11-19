// Offline emergency card for a trip: local emergency numbers, Australian missions, the consular emergency
// line, insurance, and where we sleep each night. Facts come only from official sources (plan/emergency.json),
// each with its source and the date it was checked. Unverified details stay blank.
import { esc, icon, toast } from './kit.js';
import { prettyDate } from '../core/domain.js';
import { partyOf, nameOf } from '../core/shared.js';

const tel = n => '<a href="tel:' + esc(String(n).split(' or ')[0].replace(/[^+\d]/g, '')) + '">' + esc(n) + '</a>';
export function countriesOf(ctx, t) {
  const E = ctx.EMERGENCY?.countries || {}, wanted = (t.countryQueries || []).map(String);
  return wanted.map(q => { const hit = Object.entries(E).find(([k, v]) => k === q || (v.aliases || []).some(a => a.toLowerCase() === q.toLowerCase())); return hit ? { name: hit[0], ...hit[1] } : { name: q, missing: true }; });
}
export function emergencyHTML(ctx, t, { readOnly = false } = {}) {
  const C = ctx.EMERGENCY?.consularEmergency, countries = countriesOf(ctx, t);
  const stays = ctx.store.records('bookings', t.id).filter(b => b.type === 'Accommodation').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const who = partyOf(ctx.store, t).map(p => esc(nameOf(ctx.store, p))).join(', ');
  const ins = '<section class="panel ec-block"><h2>' + icon('lock') + ' Travel insurance</h2>' + (t.insurer || t.policyNumber || t.insurerPhone
    ? '<dl class="glance"><div><dt>Insurer</dt><dd>' + esc(t.insurer || 'Not added') + '</dd></div><div><dt>Policy number</dt><dd>' + esc(t.policyNumber || 'Not added') + '</dd></div><div><dt>24-hour emergency line</dt><dd>' + (t.insurerPhone ? tel(t.insurerPhone) : 'Not added') + '</dd></div></dl>'
    : '<p class="muted">Not added yet. Add your insurer’s emergency number and policy number below so they work offline.</p>') +
    (readOnly ? '' : '<details><summary>Edit insurance details</summary><form class="grid-form" data-form="ecInsurance"><input type="hidden" name="trip" value="' + esc(t.id) + '"><div class="field"><label for="ec-i">Insurer</label><input id="ec-i" name="insurer" value="' + esc(t.insurer || '') + '" maxlength="120"></div><div class="field"><label for="ec-p">Policy number</label><input id="ec-p" name="policyNumber" value="' + esc(t.policyNumber || '') + '" maxlength="80"></div><div class="field"><label for="ec-h">24-hour emergency line</label><input id="ec-h" name="insurerPhone" type="tel" value="' + esc(t.insurerPhone || '') + '" maxlength="40"></div><div class="wide row end"><button class="btn">Save</button></div></form></details>') + '</section>';
  return '<div class="ec">' +
    '<section class="panel ec-top"><div class="row between wrap"><div><p class="eyebrow">Emergency card</p><h2>' + esc(t.name) + '</h2><p class="muted small">Travelling: ' + who + '. Works offline. Facts checked on the date shown; recheck them before you travel.</p></div>' + (readOnly ? '' : '<button class="btn" data-act="print">' + icon('download') + ' Print</button>') + '</div>' +
    (C ? '<p class="ec-big">' + icon('alert') + ' <span>' + esc(C.label) + ': ' + tel(C.overseas) + ' from overseas, ' + tel(C.inAustralia) + ' in Australia</span></p><p class="muted small">Source: <a href="' + esc(C.source) + '" target="_blank" rel="noopener noreferrer">Smartraveller</a> · checked ' + esc(prettyDate(C.checked)) + '</p>' : '') + '</section>' +
    countries.map(c => c.missing
      ? '<section class="panel ec-block"><h2>' + esc(c.name) + '</h2><p class="flag-line">No verified emergency details stored for ' + esc(c.name) + ' yet. Check Smartraveller and add them before you travel.</p></section>'
      : '<section class="panel ec-block"><h2>' + esc(c.name) + '</h2><p class="muted small">Smartraveller advice: ' + esc(c.adviceLevel) + ' · <a href="' + esc(c.smartraveller) + '" target="_blank" rel="noopener noreferrer">Current advice ' + icon('external') + '</a></p>' +
        '<h3>Local emergency numbers</h3><dl class="ec-nums">' + c.emergency.map(([l, n]) => '<div><dt>' + esc(l) + '</dt><dd>' + tel(n) + '</dd></div>').join('') + '</dl>' +
        '<h3>Australian ' + (c.missions.length > 1 ? 'missions' : 'mission') + '</h3>' + c.missions.map(m => '<div class="ec-mission"><b>' + esc(m.name) + '</b><br>' + esc(m.address) + '<br>' + tel(m.phone) + ' · <a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a>' + (m.hours ? '<br><span class="muted small">' + esc(m.hours) + '</span>' : '') + '</div>').join('') +
        '<p class="muted small">Source: <a href="' + esc(c.source) + '" target="_blank" rel="noopener noreferrer">Smartraveller, ' + esc(c.name) + '</a> · checked ' + esc(prettyDate(c.checked)) + '. Recheck before travel.</p></section>').join('') +
    ins +
    '<section class="panel ec-block"><h2>' + icon('journeys') + ' Where we sleep</h2>' + (stays.length ? '<ul class="plain">' + stays.map(b => '<li><b>' + esc(b.date ? prettyDate(b.date) : 'Date not set') + (b.end ? ' – ' + esc(prettyDate(b.end)) : '') + '</b> · ' + esc(b.title) + (b.address ? '<br>' + esc(b.address) : '') + (b.phone ? '<br>' + tel(b.phone) : '') + '</li>').join('') + '</ul>' : '<p class="muted">No stays in the Wallet yet. Add each hotel, cabin or overnight train as an Accommodation booking and it appears here, night by night.</p>') + '</section></div>';
}
export const forms = {
  async ecInsurance(f, ctx) {
    const set = {}; for (const k of ['insurer', 'policyNumber', 'insurerPhone']) set[k] = f[k].value.trim();
    await ctx.store.patch('trip', f.trip.value, set); toast('Saved on the emergency card');
  },
};

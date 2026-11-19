// Quick-add expense: a small sheet that works with no connection. The expense saves on this device at once
// and syncs later; a receipt photo is shrunk, kept on the device and uploads with the next sync.
import { esc, icon, field, toast, confirmDialog } from './kit.js';
import { newId } from '../core/store.js';
import { money, prettyDate, todayISO } from '../core/domain.js';
import { partyOf, legPartyOn, nameOf } from '../core/shared.js';
import { SPEND_CATEGORIES, spendSummary, dailyAllowance } from '../core/spend.js';
import { addFile, fileFields, fileURL } from '../core/files.js';
import { compressImage } from '../core/vault.js';
import { getRates } from './rates.js';

const CURRENCIES = ['AUD', 'TRY', 'EGP', 'USD', 'EUR', 'GBP', 'NZD', 'JPY', 'KGS', 'KZT', 'UZS', 'TJS', 'CNY', 'INR', 'NPR', 'THB', 'IDR', 'ISK', 'NOK', 'CAD', 'CLP', 'ARS', 'PEN'];
export const fab = (tripId, date = '') => '<button class="fab" data-act="expenseNew" data-trip="' + esc(tripId) + '" data-date="' + esc(date) + '" aria-label="Add an expense">' + icon('plus') + '<span>Expense</span></button>';

function sheet(ctx, trip, date) {
  const store = ctx.store, party = partyOf(store, trip), on = legPartyOn(store, trip, date).filter(p => party.includes(p));
  const last = store.records('expenses', trip.id).at(-1), cur = last?.currency || 'AUD';
  const payer = party.includes(ctx.person) ? ctx.person : (last?.paidBy && party.includes(last.paidBy) ? last.paidBy : party[0]);
  return '<form class="grid-form expense-form" data-form="expenseSave"><input type="hidden" name="trip" value="' + esc(trip.id) + '"><h2 class="wide">Add an expense</h2><p class="wide muted small">' + esc(trip.name) + '. Saved on this device straight away; it syncs when you are online.</p>' +
    field(['amount', 'Amount', 'money'], '', { required: true }) +
    '<div class="field"><label for="f-currency">Currency</label><input id="f-currency" name="currency" list="curlist" value="' + esc(cur) + '" maxlength="3" autocapitalize="characters" required pattern="[A-Za-z]{3}"><datalist id="curlist">' + CURRENCIES.map(c => '<option value="' + c + '">').join('') + '</datalist></div>' +
    field(['category', 'Category', 'select', SPEND_CATEGORIES], last?.category || 'Food and drink') +
    field(['date', 'Date', 'date'], date, { required: true }) +
    field(['paidBy', 'Who paid', 'select', party.map(p => [p, nameOf(store, p)])], payer) +
    '<fieldset class="wide covers"><legend>Who it covers</legend>' + party.map(p => '<label class="check"><input type="checkbox" name="covers" value="' + esc(p) + '"' + (on.includes(p) ? ' checked' : '') + '> ' + esc(nameOf(store, p)) + '</label>').join('') + '<p class="muted small">Split equally between the people ticked. Default: everyone travelling that day.</p></fieldset>' +
    field(['note', 'Note (optional)'], '') +
    '<div class="field wide"><label for="f-receipt">Receipt photo (optional)</label><input id="f-receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp"></div>' +
    '<div class="wide row end"><button type="button" class="btn ghost" data-act="expenseClose">Cancel</button><button class="btn primary">Save expense</button></div></form>';
}
function open(html) {
  document.getElementById('expdlg')?.remove();
  const d = document.createElement('dialog'); d.id = 'expdlg'; d.className = 'sheet'; d.innerHTML = html; document.body.append(d); d.showModal();
  d.querySelector('input[name=amount]')?.focus();
}

// Spending panel for the Money tab and the Today view.
export function spendPanel(ctx, trip, { date = '', compact = false } = {}) {
  const store = ctx.store, s = spendSummary(store, trip), al = dailyAllowance(store, trip), N = id => esc(nameOf(store, id));
  const fmtAll = o => Object.entries(o).map(([c, v]) => money(Math.round(v * 100) / 100, c)).join(' + ') || money(0, 'AUD');
  const head = '<section class="panel spend"><div class="row between wrap"><h2>' + (compact ? 'Spent today' : 'Spent on the road') + '</h2><button class="btn primary small" data-act="expenseNew" data-trip="' + esc(trip.id) + '" data-date="' + esc(date || todayISO()) + '">' + icon('plus') + ' Add expense</button></div>';
  if (compact) {
    const row = s.rows.find(r => r.date === date), tot = row ? row.totals : {};
    return head + '<p class="big">' + fmtAll(tot) + '</p>' + (al ? '<p class="muted small">Daily allowance about ' + money(Math.round(al.amount), al.currency) + ', from ' + esc(al.basis) + '.</p>' : '') + (row ? '<ul class="plain small">' + row.items.map(e => '<li>' + money(Number(e.amount), e.currency) + ' · ' + esc(e.category) + (e.note ? ' · ' + esc(e.note) : '') + ' · paid by ' + N(e.paidBy) + '</li>').join('') + '</ul>' : '<p class="muted small">Nothing logged today.</p>') + '</section>';
  }
  const party = partyOf(store, trip), people = store.list('people');
  const who = '<details class="party-edit"><summary>Travellers on this trip: ' + party.map(N).join(', ') + '</summary><form class="grid-form" data-form="partySave"><input type="hidden" name="trip" value="' + esc(trip.id) + '"><fieldset class="wide covers"><legend>Who is on this trip</legend>' + people.map(p => '<label class="check"><input type="checkbox" name="party" value="' + esc(p.id) + '"' + (party.includes(p.id) ? ' checked' : '') + '> ' + esc(p.name || p.id) + (p.guest === 'yes' ? ' <span class="muted small">(guest)</span>' : '') + '</label>').join('') + '</fieldset>' + field(['guest', 'Add a guest (optional)'], '', { hint: 'A first name or nickname. A guest joins only the trips you tick them on.' }) + '<div class="wide row end"><button class="btn">Save travellers</button></div></form></details>';
  if (!s.count) return head + who + '<p class="muted">Nothing logged yet. Tap “Expense” on the road; it works offline and flows into Settle up.</p>' + (al ? '<p class="muted small">Daily allowance to compare against: about ' + money(Math.round(al.amount), al.currency) + ' a day, from ' + esc(al.basis) + '.</p>' : '') + '</section>';
  return head + who + '<p><b>Total so far:</b> ' + fmtAll(s.total) + '</p>' +
    (al ? '<p class="muted small">Daily allowance: about ' + money(Math.round(al.amount), al.currency) + ', from ' + esc(al.basis) + '. Days spent in other currencies are not compared, because converting them would be a guess.</p>' : '<p class="muted small">Set a budget on the Overview to see a daily allowance.</p>') +
    '<div class="table-wrap" tabindex="0" role="region" aria-label="Spending by day"><table class="spend-table"><thead><tr><th scope="col">Day</th><th scope="col">Spent</th><th scope="col">Running total</th>' + (al ? '<th scope="col">vs allowance</th>' : '') + '</tr></thead><tbody>' +
    s.rows.map(r => { const own = r.totals[al?.currency]; const st = al && own != null ? (own <= al.amount ? '<span class="pill visited">under</span>' : '<span class="pill hold">over by ' + money(Math.round(own - al.amount), al.currency) + '</span>') : (al ? '<span class="muted small">other currency</span>' : ''); return '<tr><th scope="row">' + esc(r.date ? prettyDate(r.date) : 'No date') + '</th><td>' + fmtAll(r.totals) + '</td><td>' + fmtAll(r.running) + '</td>' + (al ? '<td>' + st + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table></div>' +
    '<p><button class="btn small ghost" data-act="spendAUD" data-trip="' + esc(trip.id) + '">Show AUD estimate</button> <span id="spendAUD" class="muted small" aria-live="polite"></span></p>' + '<h3>Per person</h3><ul class="plain">' + Object.entries(s.perPerson).map(([c, o]) => '<li><b>' + esc(c) + '</b> · ' + Object.entries(o).map(([p, v]) => N(p) + ' ' + money(Math.round(v * 100) / 100, c)).join(' · ') + '</li>').join('') + '</ul>' +
    '<details><summary>Every expense (' + s.count + ')</summary><ul class="plain expense-list">' + store.records('expenses', trip.id).slice().reverse().map(e => '<li class="row between wrap"><span>' + esc(e.date ? prettyDate(e.date) : '') + ' · <b>' + money(Number(e.amount), e.currency) + '</b> · ' + esc(e.category) + (e.note ? ' · ' + esc(e.note) : '') + ' · paid by ' + N(e.paidBy) + ' for ' + String(e.covers || '').split(',').filter(Boolean).map(N).join(', ') + (e.file ? ' · <button class="linkish" data-act="openFile" data-file="' + esc(e.file) + '">receipt</button>' : '') + '</span><button class="iconbtn" data-act="expenseDelete" data-id="' + esc(e.id) + '" aria-label="Delete this expense">' + icon('close') + '</button></li>').join('') + '</ul></details>' +
    (s.unknown.length ? '<p class="flag-line">' + s.unknown.length + ' expense(s) have no amount, so they are not counted.</p>' : '') + '</section>';
}

export const actions = {
  expenseNew(el, ctx) {
    const trip = ctx.store.get('trip', el.dataset.trip); if (!trip) return;
    open(sheet(ctx, trip, el.dataset.date || todayISO()));
  },
  async openFile(el, ctx) { try { const u = await fileURL(ctx.store, ctx.sync, el.dataset.file); window.open(u, '_blank', 'noopener'); } catch { toast('That receipt is not on this device yet. It downloads when you are online.'); } },
  async spendAUD(el, ctx) {
    const out = document.getElementById('spendAUD'), r = await getRates(ctx); if (!out) return;
    if (!r?.rates) { out.textContent = 'Needs a connection the first time, to fetch exchange rates.'; return; }
    const tot = spendSummary(ctx.store, ctx.store.get('trip', el.dataset.trip)).total, missing = []; let aud = 0;
    for (const [c, v] of Object.entries(tot)) { if (c === 'AUD') aud += v; else if (r.rates[c]) aud += v / r.rates[c]; else missing.push(c); }
    out.textContent = 'About ' + money(Math.round(aud), 'AUD') + ' at the European Central Bank rates of ' + prettyDate(r.date) + (missing.length ? '. Not included (no rate): ' + missing.join(', ') : '') + '. An estimate, not what your bank charged.';
  },
  expenseClose() { document.getElementById('expdlg')?.close(); document.getElementById('expdlg')?.remove(); },
  async expenseDelete(el, ctx) { if (!await confirmDialog('Delete this expense?', { ok: 'Delete', danger: true, detail: 'It also leaves Settle up. Its receipt is removed after the change syncs.' })) return; await ctx.store.remove('expenses', el.dataset.id); toast('Expense deleted'); },
};
export const forms = {
  async partySave(f, ctx) {
    const store = ctx.store, chosen = [...f.querySelectorAll('input[name=party]:checked')].map(i => i.value), name = f.guest.value.trim().slice(0, 40);
    if (name) {
      const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guest';
      let id = base, n = 2; while (store.get('people', id)) id = base + '-' + n++;
      await store.create('people', { id, name, guest: 'yes' }); chosen.push(id);
    }
    if (!chosen.length) throw new Error('Tick at least one traveller.');
    await store.patch('trip', f.trip.value, { party: chosen.join(',') }); toast('Travellers saved');
  },
  async expenseSave(f, ctx) {
    const amount = Number(String(f.amount.value).replace(/,/g, '')), currency = String(f.currency.value).trim().toUpperCase();
    if (f.amount.value === '' || !Number.isFinite(amount) || amount < 0) throw new Error('Enter the amount (0 is fine for something free).');
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Use a three-letter currency code, like TRY or EGP.');
    const covers = [...f.querySelectorAll('input[name=covers]:checked')].map(i => i.value);
    if (!covers.length) throw new Error('Tick at least one person it covers.');
    const row = { id: newId('expense'), trip: f.trip.value, date: f.date.value || todayISO(), amount: String(amount), currency, category: f.category.value, paidBy: f.paidBy.value, covers: covers.join(','), note: f.note.value.trim().slice(0, 300) };
    const file = f.receipt.files?.[0]; if (file) Object.assign(row, fileFields(await addFile(ctx.store, await compressImage(file))));
    await ctx.store.create('expenses', row);
    actions.expenseClose(); toast('Saved ' + money(amount, currency) + (navigator.onLine ? '' : ' on this device. It syncs when you are back online.'));
  },
};

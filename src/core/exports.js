// Exports that existed before (workbook, calendar, offline trip page, research brief, CSV) and
// import compatibility with every earlier Wanderlust JSON/CSV format.
import { costTotals, deadlines, money, nightsOf, prettyDate, isBlank } from './domain.js';
import { clone, validatePlace, PLACE_STATUSES, ensureProfileIds } from './model.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// In the packaged desktop app there is no browser download bar, so files are saved through a native save dialog.
export async function download(name, body, type) {
  const T = globalThis.__TAURI__;
  if (T?.dialog?.save && T?.fs) {
    const path = await T.dialog.save({ defaultPath: name }); if (!path) return;
    if (typeof body === 'string') await T.fs.writeTextFile(path, body); else await T.fs.writeFile(path, new Uint8Array(await body.arrayBuffer()));
    return;
  }
  const u = URL.createObjectURL(body instanceof Blob ? body : new Blob([body], { type })); const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}

export function calendarICS(store, tripId) {
  const ie = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wanderlust//Travel deadlines//EN', 'CALSCALE:GREGORIAN'];
  const items = deadlines(store, tripId);
  for (const r of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    const trip = store.get('trip', r.trip)?.name;
    lines.push('BEGIN:VEVENT', 'UID:' + r.id + '@elsewhere-travel', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + r.date.replaceAll('-', ''), 'SUMMARY:' + ie((trip ? trip + ': ' : '') + r.kind + ' — ' + r.title), 'DESCRIPTION:' + ie((r.notes || '') + '\n' + (r.url || '')), 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + ie(r.title), 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const folded = lines.flatMap(s => { const out = []; let line = ''; for (const c of s) { if (new TextEncoder().encode(line + c).length > 70) { out.push(line); line = ' ' + c; } else line += c; } out.push(line); return out; }).join('\r\n') + '\r\n';
  return { body: folded, count: items.length };
}

export function workbookXML(store, FORTY, fortyModel) {
  const docs = store.toDocs(), trips = docs.profile.trips;
  const xml = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  const tables = {
    Summary: [['Wanderlust — saved planning snapshot'], ['Exported UTC', new Date().toISOString()], ['Currencies', 'Each cost keeps its own currency; amounts are not converted'], ['Re-import', 'Use the full backup (.elsewhere.json) to restore. This workbook is a read-only export.']],
    History: [['Country / territory', 'Status', 'More to explore', 'Notes'], ...docs.profile.countries.map(c => [c.name, c.status, c.revisit ? 'Yes' : '', c.notes])],
    Trips: [['ID', 'Journey', 'Status', 'Start', 'Travellers', 'Budget', 'Budget currency', 'Budget basis', 'Local nights', 'Scope', 'Notes'], ...trips.map(t => [t.id, t.name, t.status, t.startDate, t.travellers, t.budget, t.budgetCurrency || 'AUD', t.budgetBasis || 'for the party', nightsOf(t), t.scope, t.notes])],
    Stops: [['Trip', 'Order', 'Stop', 'Nights'], ...trips.flatMap(t => t.stops.map((s, i) => [t.name, i + 1, s.name, s.nights]))],
    Costs: [['Trip', 'Item', 'Currency', 'Total', 'Paid', 'Basis', 'My share', 'Due', 'Linked booking', 'URL'], ...trips.flatMap(t => t.costs.map(c => [t.name, c.item, c.currency || 'AUD', c.total, c.paid, c.basis || 'for the party', c.myShare, c.dueDate, c.bookingId || '', c.url]))],
    Catalogue: [['ID', 'Place', 'Country', 'Region', 'Status', 'Latitude', 'Longitude', 'Notes'], ...docs.places.map(p => [p.id, p.name, p.country, p.region, p.status, p.lat, p.lon, p.notes])],
    DestinationDays: [['Destination', 'Step', 'Editorial outline'], ...docs.places.flatMap(p => (p.route || []).map((d, i) => [p.name, i + 1, Array.isArray(d) ? d.join(' · ') : JSON.stringify(d)]))],
  };
  const f = fortyModel(store, FORTY);
  tables['The forty'] = [['Slot', 'Place', 'Country', 'Collection', 'Travel status', 'Priority', 'Planned year', 'Completed on', 'Experience'], ...f.entries.map(e => { const p = f.place(e), pe = f.personal(e); return [f.slot(e) || '', e.name, e.country, f.groupOf(e), p?.status || 'Unconfirmed', pe.priority || '', pe.plannedYear || '', pe.completedOn || '', e.experience]; })];
  for (const [k, rows] of Object.entries(docs.hub.records)) { if (!rows.length) continue; const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(x => x !== 'id'); tables[k] = [keys, ...rows.map(r => keys.map(x => k !== 'id' && x === 'trip' ? trips.find(t => t.id === r.trip)?.name || r.trip : r[x]))]; }
  return '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Head"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#143E33" ss:Pattern="Solid"/></Style></Styles>' + Object.entries(tables).map(([name, rows]) => '<Worksheet ss:Name="' + xml(name.slice(0, 31)) + '"><Table>' + rows.map((row, i) => '<Row>' + row.map(v => '<Cell' + (!i ? ' ss:StyleID="Head"' : '') + '><Data ss:Type="' + (typeof v === 'number' ? 'Number' : 'String') + '">' + xml(v) + '</Data></Cell>').join('') + '</Row>').join('') + '</Table></Worksheet>').join('') + '</Workbook>';
}

export function offlineTripHTML(store, tripId) {
  const t = store.get('trip', tripId), days = store.records('days', tripId), legs = store.records('legs', tripId), bookings = store.records('bookings', tripId), research = store.records('research', tripId), contacts = store.records('contacts', tripId), phrases = store.records('phrases', tripId);
  const dates = [...new Set([...days, ...legs, ...bookings].map(r => r.date).filter(Boolean))].sort();
  const card = (title, lines) => '<section><h3>' + esc(title) + '</h3>' + lines.filter(Boolean).map(l => '<p>' + esc(l) + '</p>').join('') + '</section>';
  const body = '<h1>' + esc(t.name) + '</h1><p class="note">Printed/saved ' + esc(new Date().toLocaleString('en-AU')) + '. This page is a snapshot. Your Wanderlust app keeps the live, editable copy.</p><p>' + esc(t.scope || '') + '</p>' +
    dates.map(d => '<h2>' + esc(prettyDate(d)) + '</h2>' + days.filter(r => r.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(r => card((r.time ? r.time + ' ' : '') + r.title, [r.location, r.transport, r.duration, r.notes])).join('') + legs.filter(r => r.date === d).map(r => card(r.from + ' → ' + r.to, [[r.mode, r.operator, r.status].filter(Boolean).join(' · '), r.arrival && 'Arrival: ' + r.arrival, r.notes])).join('') + bookings.filter(r => r.date === d).map(r => card(r.title, [r.type, r.reference && 'Reference: ' + r.reference, r.address, r.notes])).join('')).join('') +
    '<h2>Contacts</h2>' + (contacts.map(c => card(c.name, [c.role, c.phone, c.email, c.address, c.checked && 'Checked ' + c.checked])).join('') || '<p>None saved.</p>') +
    '<h2>Phrases</h2>' + (phrases.map(p => card(p.phrase, [p.meaning, p.language])).join('') || '<p>None saved.</p>') +
    '<h2>Research</h2>' + research.map(r => card(r.title, [r.topic, r.status, r.notes, r.url && 'Source: ' + r.url, 'Checked: ' + (r.checked || 'not recorded')])).join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(t.name) + ' — Wanderlust</title><style>body{max-width:760px;margin:24px auto;padding:0 18px;font:17px/1.55 system-ui,sans-serif;background:#f4f0e6;color:#193931}h1,h2,h3{font-family:Georgia,serif}h2{border-top:2px solid #b88c51;padding-top:12px;margin-top:28px}section{border-bottom:1px solid #d5d0bf;padding:8px 0}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:.3em 0}.note{color:#5d6a61;font-size:14px}</style>' + body + '</html>';
}

export function researchBrief(store, tripId) {
  const t = store.get('trip', tripId), docs = store.toDocs(), trip = docs.profile.trips.find(x => x.id === tripId), rec = k => docs.hub.records[k].filter(r => r.trip === tripId);
  return 'Please research and tailor this journey. Use current primary sources and give each finding a URL and checked date. Check passport nationality, dates, entry and safety advice, insurance, realistic transport and buffers, seasonal access, permits and costs. Ask only for essential missing information. Label unknowns and estimates. Suggestions are not bookings. Respect any On hold condition. Do not invent personal details.\n\n' + JSON.stringify({ trip, brief: rec('preferences'), legs: rec('legs'), days: rec('days'), research: rec('research'), companions: rec('votes'), requests: rec('requests') }, null, 2);
}

const csvKeys = ['id', 'name', 'country', 'region', 'category', 'status', 'priority', 'lat', 'lon', 'season', 'nights', 'base', 'arrival', 'transport', 'why', 'source', 'startDate', 'tripNights', 'pace', 'people', 'budget', 'interest', 'notes'];
export const placesCSV = places => { const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'; return [csvKeys.join(','), ...places.map(p => csvKeys.map(k => cell(p[k])).join(','))].join('\r\n'); };
export function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; } else if (c === ',' && !quoted) { row.push(field); field = ''; } else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''; } else field += c; }
  if (quoted) throw new Error('Unclosed CSV quote'); row.push(field); if (row.some(Boolean)) rows.push(row);
  const h = rows.shift().map(x => x.replace(/^\uFEFF/, '').trim());
  return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

// Turn any earlier export into reviewable operations against this device's current data.
export function planImport(store, input, name = '') {
  const ops = [], notes = [];
  const placeOps = rows => {
    for (const r of rows) {
      if (r?.deleted) continue;
      const existing = store.get('place', r.id);
      const p = { ...(existing || { route: [], checks: {} }), ...r };
      for (const k of ['lat', 'lon', 'nights', 'tripNights', 'people', 'budget']) if (p[k] !== undefined && p[k] !== '' && p[k] !== null) p[k] = Number(p[k]); else if (p[k] === '') delete p[k];
      p.nights ||= 4; p.region ||= 'Other'; p.country ||= ''; p.category ||= 'Personal'; p.status = PLACE_STATUSES.includes(p.status) ? p.status : 'Unconfirmed'; p.priority ||= 'Explore'; if (!Array.isArray(p.route)) p.route = [];
      const err = validatePlace(p); if (err) throw new Error((r.name || r.id || 'A row') + ': ' + err);
      if (existing) { const op = store.patchOp('place', p.id, p); if (op) ops.push(op); } else ops.push(store.createOp('place', p));
    }
  };
  const profileOps = prof => {
    ensureProfileIds(prof);
    for (const c of prof.countries) { const cur = store.get('country', c.code); if (cur) { const op = store.patchOp('country', c.code, c); if (op) ops.push(op); } else ops.push(store.createOp('country', c)); }
    for (const t of prof.trips) {
      const { costs = [], tasks = [], ...rest } = t;
      if (store.get('trip', t.id)) { const op = store.patchOp('trip', t.id, rest); if (op) ops.push(op); } else ops.push(store.createOp('trip', rest));
      for (const [kind, list] of [['cost', costs], ['task', tasks]]) for (const x of list) { if (store.get(kind, x.id)) { const op = store.patchOp(kind, x.id, x, t.id); if (op) ops.push(op); } else ops.push(store.createOp(kind, x, t.id)); }
    }
  };
  const hubOps = hub => { for (const [k, list] of Object.entries(hub.records || {})) for (const r of list) { if (store.get(k, r.id)) { const op = store.patchOp(k, r.id, r); if (op) ops.push(op); } else ops.push(store.createOp(k, r)); } if (Object.values(hub.records || {}).some(l => l.some(r => r.file))) notes.push('Attachments are listed by reference; their files were not inside this older backup.'); };
  if (typeof input === 'string') { placeOps(parseCSV(input)); notes.push('Spreadsheet rows update matching place IDs and add new places.'); }
  else if (Array.isArray(input)) { placeOps(input); notes.push('Places backup (' + input.length + ' places).'); }
  else if (input?.schemaVersion === 1 && Array.isArray(input.countries)) { profileOps(clone(input)); notes.push('Travel history and journeys backup.'); }
  else if (input?.hub && input?.profile) { hubOps(input.hub); profileOps(clone(input.profile)); if (Array.isArray(input.places)) placeOps(input.places); notes.push('Complete planning backup.'); }
  else if (input?.version === 1 && input?.records) { hubOps(input); notes.push('Planning desk backup.'); }
  else if (input?.version === 1 && Array.isArray(input.selection) && Array.isArray(input.entries)) {
    const cur = store.get('fortySelection', 'selection')?.selection || [];
    const want = input.selection, outs = cur.filter(id => !want.includes(id)), ins = want.filter(id => !cur.includes(id));
    ins.forEach((id, i) => outs[i] && ops.push(store.op('fortySelection', 'selection', 'swap', { out: outs[i], in: id })));
    notes.push('The forty export: the saved selection will be matched with ' + ops.length + ' swap(s). Visit statuses stay on each place.');
  }
  else if (input?.id && Array.isArray(input.stops)) { profileOps({ schemaVersion: 1, countries: [], trips: [input] }); notes.push('Single journey export.'); }
  else if (input?.id && Array.isArray(input.route)) { placeOps([input]); notes.push('Single destination export.'); }
  else throw new Error('This file is not a recognised Wanderlust export.');
  return { ops, notes, name };
}

export const costSummary = costs => costTotals(costs).map(t => money(t.known, t.currency) + ' known' + (t.unknown ? ' + ' + t.unknown + ' unpriced' : '')).join(' · ') || 'No costs entered';
export { isBlank };

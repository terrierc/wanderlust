// Shared UI vocabulary: escaping, icons, form fields, photographs, toasts and confirmations.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = esc;
export const qs = o => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v !== null && v !== undefined && v !== false) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };
export const safeURL = s => { try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

const P = {
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  journeys: '<path d="M4 19c4-1 3-6 8-7s4-6 8-7"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="5" r="1.6"/>',
  forty: '<path d="M12 3l1.9 5.6H20l-4.9 3.6 1.9 5.8L12 14.4 7 18l1.9-5.8L4 8.6h6.1z"/>',
  story: '<path d="M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M9 8h5M9 12h5"/>',
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 5l-7 7 7 7"/>', arrow: '<path d="M7 17 17 7M9 7h8v8"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/>', offline: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/><path d="M4 4l16 16"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.3L4 9M4 13a8 8 0 0 0 14.3 4.3L20 15"/><path d="M4 4v5h5M20 20v-5h-5"/>', alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>', file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>', plane: '<path d="M10.5 21l2-7-6-3 1.5-1.5 6.5 1.5 4-4c.8-.8 2.2-.8 2.5 0 .3.8-.2 1.7-1 2.5l-4 4 1.5 6.5L16 22.5l-3-6-2.5 4.5z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>', menu: '<path d="M4 7h16M4 12h16M4 17h10"/>', tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', spark: '<path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"/>',
};
export const icon = (n, label) => '<svg class="i" viewBox="0 0 24 24" ' + (label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"') + '>' + (P[n] || '') + '</svg>';
export const compass = '<svg class="compass" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="43" stroke-dasharray="1 5"/><path d="M50 8L57 43L92 50L57 57L50 92L43 57L8 50L43 43Z"/><path class="f" d="M50 21L56 44L50 50L44 56L50 79L50 50Z"/></svg>';

// ---------- forms ----------
// Field spec: [name, label, type='text', options|extra]
export function field([name, label, type = 'text', extra], value, { required = false, hint = '' } = {}) {
  const id = 'f-' + name, v = value ?? '';
  const req = required ? ' required aria-required="true"' : '';
  const hintId = hint ? ' aria-describedby="' + id + '-hint"' : '';
  let control;
  if (type === 'textarea') control = '<textarea id="' + id + '" name="' + name + '" rows="3" maxlength="10000"' + req + hintId + '>' + esc(v) + '</textarea>';
  else if (type === 'select') { const opts = typeof extra === 'string' ? extra.split('|') : extra; control = '<select id="' + id + '" name="' + name + '"' + req + hintId + '>' + opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>'; }
  else if (type === 'checkbox') return '<label class="check"><input type="checkbox" name="' + name + '"' + (v === true || v === 'true' ? ' checked' : '') + '> <span>' + esc(label) + '</span></label>';
  else if (type === 'money') control = '<input id="' + id + '" name="' + name + '" type="number" inputmode="decimal" min="0" step="any" value="' + esc(v) + '" placeholder="Unknown"' + hintId + ' data-kind="money">';
  else if (type === 'number') control = '<input id="' + id + '" name="' + name + '" type="number" inputmode="numeric" value="' + esc(v) + '"' + (extra ? ' min="' + extra[0] + '" max="' + extra[1] + '" step="' + (extra[2] || 1) + '"' : '') + req + hintId + ' data-kind="number">';
  else if (type === 'zone') control = '<input id="' + id + '" name="' + name + '" list="zones" value="' + esc(v) + '" placeholder="e.g. Europe/Oslo" autocomplete="off" spellcheck="false"' + hintId + '>';
  else if (type === 'file') control = '<input id="' + id + '" name="' + name + '" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"' + hintId + '>';
  else control = '<input id="' + id + '" name="' + name + '" type="' + type + '" value="' + esc(v) + '"' + (type === 'text' ? ' maxlength="400"' : '') + req + hintId + '>';
  return '<div class="field' + (type === 'textarea' ? ' wide' : '') + '"><label for="' + id + '">' + esc(label) + (required ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</label>' + control + (hint ? '<small id="' + id + '-hint">' + esc(hint) + '</small>' : '') + '</div>';
}
// Collect values; numbers become numbers, blank money/number becomes null (unknown), 0 stays 0.
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file' || el.type === 'submit' || el.type === 'button') continue;
    if (el.type === 'checkbox') { out[el.name] = el.checked; continue; }
    if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; continue; }
    const v = el.value.trim();
    out[el.name] = (el.dataset.kind === 'money' || el.dataset.kind === 'number' || el.type === 'number') ? (v === '' ? null : Number(v)) : v;
  }
  return out;
}

// ---------- photographs (only bundled photos with licence metadata) ----------
export function photo(PHOTOS, id, { cls = '', eager = false, alt, caption = false, illustrative = false } = {}) {
  const p = PHOTOS[id]; if (!p) return '';
  return '<figure class="photo ' + cls + '"><img src="' + esc(p.src) + '" alt="' + esc(alt ?? p.title) + '" width="' + (p.width || 800) + '" height="' + (p.height || 533) + '"' + (eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">' + (caption ? '<figcaption>' + (illustrative ? '<strong>Regional imagery</strong> · ' : '') + esc(p.title) + ' · ' + esc(p.credit) + '</figcaption>' : '') + '</figure>';
}

// ---------- feedback ----------
let toastTimer;
export function toast(msg, { tone = '' } = {}) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.className = 'toast show ' + tone; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4200);
}
export function confirmDialog(message, { ok = 'Continue', cancel = 'Cancel', danger = false, detail = '' } = {}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'confirm';
    d.innerHTML = '<form method="dialog"><h2>' + esc(message) + '</h2>' + (detail ? '<p>' + esc(detail) + '</p>' : '') + '<div class="row end"><button value="no" class="btn ghost">' + esc(cancel) + '</button><button value="yes" class="btn ' + (danger ? 'danger' : 'primary') + '">' + esc(ok) + '</button></div></form>';
    document.body.append(d); d.addEventListener('close', () => { resolve(d.returnValue === 'yes'); d.remove(); }); d.showModal();
  });
}
export function promptDialog(message, { label = '', type = 'text', ok = 'Continue', detail = '' } = {}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'confirm';
    d.innerHTML = '<form method="dialog"><h2>' + esc(message) + '</h2>' + (detail ? '<p>' + esc(detail) + '</p>' : '') + '<div class="field"><label for="pd">' + esc(label) + '</label><input id="pd" type="' + type + '" autocomplete="off"></div><div class="row end"><button value="no" class="btn ghost" formnovalidate>Cancel</button><button value="yes" class="btn primary">' + esc(ok) + '</button></div></form>';
    document.body.append(d); d.addEventListener('close', () => { resolve(d.returnValue === 'yes' ? d.querySelector('input').value : null); d.remove(); }); d.showModal();
  });
}
export const pill = (text, tone = '') => '<span class="pill ' + tone + '">' + esc(text) + '</span>';
export const statusTone = s => s === 'Visited' ? 'visited' : ['Want to go', 'Planning', 'Booked'].includes(s) ? 'wish' : s === 'Limited visit' ? 'limited' : s === 'On hold' ? 'hold' : '';
export const ext = (href, label) => { const u = safeURL(href); return u ? '<a class="ext" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + ' ' + icon('external') + '<span class="needs-net">Needs a connection</span></a>' : ''; };
export function empty(title, body, action = '') { return '<div class="empty">' + compass + '<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>' + action + '</div>'; }
export const fmtBytes = n => n == null ? '—' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
export function ago(iso) { if (!iso) return 'never'; const s = (Date.now() - new Date(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); }

// A trip's cover photo: its chosen theme, else a photo of one of its forty places, else one of its stops.
export function coverId(ctx, t) {
  if (!t) return null; const has = id => id && ctx.PHOTOS[id] ? id : null;
  return has(t.theme) || ctx.FORTY.entries.filter(e => ctx.store.get('fortyEntry', e.id)?.tripId === t.id).map(e => has(e.photoId) || has(e.id) || has(e.placeId)).find(Boolean) || (t.stops || []).map(x => has(x.id)).find(Boolean) || null;
}

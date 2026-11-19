// Quick jump (⌘K / Ctrl+K, or "/"): screens, journeys, places, bookings, memories — all from this device.
import { esc, icon } from './kit.js';
import { search } from '../core/search.js';
const SCREENS = [['Explore', '/'], ['Plan', '/plan'], ['Journeys', '/journeys'], ['The forty', '/forty'], ['Travel story', '/story'], ['Today', '/today'], ['Wallet', '/wallet'], ['Deals board', '/deals'], ['Settle up', '/settle'], ['Documents', '/documents'], ['Sync & account', '/more/sync'], ['Offline & downloads', '/more/offline'], ['Backup & restore', '/more/backup'], ['Settings', '/more/settings']];
export function installPalette(ctx) {
  const d = document.createElement('dialog'); d.className = 'palette'; d.setAttribute('aria-label', 'Quick jump');
  d.innerHTML = '<form method="dialog" class="pal-in"><label class="sr" for="palq">Jump to</label><div class="pal-search">' + icon('search') + '<input id="palq" autocomplete="off" placeholder="Jump to a place, trip, booking or screen…" role="combobox" aria-expanded="true" aria-controls="palres"></div><ul id="palres" role="listbox"></ul><p class="pal-hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p></form>';
  document.body.append(d);
  const input = d.querySelector('#palq'), list = d.querySelector('#palres'); let items = [], sel = 0;
  const draw = () => {
    const q = input.value.trim();
    items = q ? [...SCREENS.filter(([l]) => l.toLowerCase().includes(q.toLowerCase())).map(([title, href]) => ({ group: 'Screen', title, sub: '', href })), ...search(ctx.store, ctx.FORTY, q, 30)] : SCREENS.map(([title, href]) => ({ group: 'Screen', title, sub: '', href }));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map((r, i) => '<li role="option" id="pal-' + i + '" aria-selected="' + (i === sel) + '" data-i="' + i + '"><span class="pal-g">' + esc(r.group) + '</span><strong>' + esc(r.title) + '</strong><small>' + esc(r.sub || '') + '</small></li>').join('') || '<li class="muted">Nothing found on this device.</li>';
    input.setAttribute('aria-activedescendant', items.length ? 'pal-' + sel : '');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const go = i => { const r = items[i]; if (!r) return; d.close(); ctx.nav(r.href); };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') { e.preventDefault(); go(sel); } });
  list.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) go(+li.dataset.i); });
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  const open = () => { if (d.open) return; input.value = ''; sel = 0; draw(); d.showModal(); input.focus(); };
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); open(); }
  });
  ctx.actions.openPalette = open;
}

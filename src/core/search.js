// Global on-device search across places, journeys, bookings, documents, memories and research.
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SOURCES = [
  ['place', 'Places', p => [p.name, p.country, p.region, p.why, p.base, p.notes, p.category], p => ({ title: p.name, sub: p.country + ' · ' + (p.status || ''), href: '/place/' + p.id })],
  ['trip', 'Journeys', t => [t.name, t.scope, t.notes, t.nextAction], t => ({ title: t.name, sub: t.status, href: '/journeys/' + t.id })],
  ['country', 'Travel story', c => [c.name, c.notes], c => ({ title: c.name, sub: c.status, href: '/story/' + encodeURIComponent(c.code) })],
  ['bookings', 'Bookings', r => [r.title, r.reference, r.address, r.notes, r.type, r.filename], r => ({ title: r.title, sub: [r.type, r.reference, r.date].filter(Boolean).join(' · '), href: '/journeys/' + r.trip + '/wallet?open=' + r.id })],
  ['journal', 'Memories', r => [r.title, r.notes, r.filename], r => ({ title: r.title, sub: [r.date, r.rating].filter(Boolean).join(' · '), href: '/journeys/' + r.trip + '/journal?open=' + r.id })],
  ['days', 'Itinerary', r => [r.title, r.location, r.notes, r.transport], r => ({ title: r.title, sub: [r.date, r.time, r.location].filter(Boolean).join(' · '), href: '/journeys/' + r.trip + '/days?open=' + r.id })],
  ['legs', 'Transport', r => [r.from, r.to, r.operator, r.notes], r => ({ title: r.from + ' → ' + r.to, sub: [r.mode, r.date].filter(Boolean).join(' · '), href: '/journeys/' + r.trip + '/route?open=' + r.id })],
  ['research', 'Research', r => [r.title, r.topic, r.notes], r => ({ title: r.title, sub: [r.topic, r.checked && 'checked ' + r.checked].filter(Boolean).join(' · '), href: '/journeys/' + r.trip + '/research?open=' + r.id })],
  ['contacts', 'Contacts', r => [r.name, r.role, r.phone, r.email, r.address], r => ({ title: r.name, sub: r.role || '', href: '/journeys/' + r.trip + '/research?open=' + r.id })],
  ['phrases', 'Phrases', r => [r.phrase, r.meaning, r.language], r => ({ title: r.phrase, sub: r.meaning || '', href: '/journeys/' + r.trip + '/research?open=' + r.id })],
  ['reminders', 'Reminders', r => [r.title, r.notes, r.kind], r => ({ title: r.title, sub: r.date || '', href: '/journeys/' + r.trip + '/tasks?open=' + r.id })],
];
export function search(store, FORTY, q, limit = 60) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  const score = fields => { const hay = fields.map(norm); let s = 0; for (const t of terms) { const i = hay.findIndex(h => h.includes(t)); if (i < 0) return 0; s += (i === 0 ? 10 : 3) + (hay[0].startsWith(t) ? 5 : 0); } return s; };
  for (const [kind, group, fields, view] of SOURCES) for (const r of store.list(kind)) { const s = score(fields(r)); if (s) out.push({ group, score: s, ...view(r) }); }
  for (const e of FORTY.entries) { const s = score([e.name, e.country, e.experience]); if (s) out.push({ group: 'The forty', score: s + 2, title: e.name, sub: e.country, href: '/forty/' + e.id }); }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

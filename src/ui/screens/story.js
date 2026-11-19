import { esc, icon, pill, statusTone, field, formValues, toast, compass } from '../kit.js';
import { COUNTRY_STATUSES } from '../../core/model.js';
import { countryMatch, fortyModel, prettyDate } from '../../core/domain.js';
import { createMap } from '../map.js';

export const view = {
  render(ctx) {
    const { store } = ctx, cs = store.list('country');
    const visited = cs.filter(c => c.status === 'Visited'), limited = cs.filter(c => c.status === 'Limited visit'), want = cs.filter(c => c.status === 'Want to go');
    const memories = store.list('journal').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const f = fortyModel(store, ctx.FORTY), completed = f.entries.filter(e => f.groupOf(e) === 'completed' || f.place(e)?.status === 'Visited');
    const byRegion = {}; for (const c of cs) (byRegion[c.region || 'Other'] ??= []).push(c);
    return {
      title: 'Travel story', screen: 'story',
      html: '<section class="page wide"><div class="section-head"><div><p class="eyebrow">Your story is still unfolding</p><h1>Travel story</h1><p class="lede">Countries and territories you have been to, at country level. A country visit never marks individual sights; each place keeps its own status.</p></div></div>' +
        '<dl class="stats light"><div><dt>Visited</dt><dd>' + visited.length + '</dd></div><div><dt>Limited visits</dt><dd>' + limited.length + '</dd></div><div><dt>Still calling</dt><dd>' + want.length + '</dd></div><div><dt>Memories</dt><dd>' + memories.length + '</dd></div></dl>' +
        '<div id="storyMap" class="map tall"></div><p class="map-key"><span class="dot" style="background:#2f6b52"></span>Visited <span class="dot" style="background:#c39a55"></span>Limited visit <span class="dot" style="background:#d9c79f"></span>Want to go · England is shown separately from Scotland, Wales and Northern Ireland.</p>' +
        '<div class="story-grid"><section><h2>Countries &amp; territories</h2>' + Object.entries(byRegion).sort().map(([r, list]) => '<h3 class="group-title">' + esc(r) + '</h3><ul class="country-list">' + list.map(c => '<li><a href="/story/' + encodeURIComponent(c.code) + '"><span>' + esc(c.name) + '</span>' + (c.status !== 'Visited' ? pill(c.status === 'Limited visit' ? 'Limited · ' + (c.code === 'KP' ? 'JSA only' : 'partial') : c.status, statusTone(c.status)) : '') + (c.revisit ? '<span class="more" title="More to explore">↺</span>' : '') + '</a></li>').join('') + '</ul>').join('') +
        '<form class="row wrap" data-form="countryAdd"><div class="field grow"><label for="ca">Add a country or territory</label><input id="ca" name="name" required maxlength="100"></div><div class="field"><label for="cs">Status</label><select id="cs" name="status">' + COUNTRY_STATUSES.map(s => '<option>' + s + '</option>').join('') + '</select></div><button class="btn">Add</button></form></section>' +
        '<section><h2>Memories</h2>' + (memories.length ? '<ul class="memories">' + memories.map(m => '<li><a href="/journeys/' + esc(m.trip) + '/journal?open=' + esc(m.id) + '">' + (m.file && m.filetype?.startsWith('image/') ? '<img data-file="' + esc(m.file) + '" alt="' + esc(m.filename || m.title) + '">' : '<span class="memo-mark">' + compass + '</span>') + '<span><strong>' + esc(m.title) + '</strong><small>' + esc([m.date && prettyDate(m.date), m.rating].filter(Boolean).join(' · ')) + '</small></span></a></li>').join('') + '</ul>' : '<p class="muted">Journal entries from your journeys gather here.</p>') +
        '<h2>Experiences completed</h2><ul class="plain">' + completed.map(e => '<li><a href="/forty/' + esc(e.id) + '">' + esc(e.name) + '</a> <span class="muted">· ' + esc(e.country) + '</span></li>').join('') + '</ul><p class="muted small">Completion means the place visit you confirmed. Specific activities (such as the Milford Track) are not assumed.</p></section></div></section>',
      async mount(root) {
        const { fileURL } = await import('../../core/files.js');
        for (const img of root.querySelectorAll('img[data-file]')) fileURL(store, ctx.sync, img.dataset.file).then(u => { img.src = u; }).catch(() => img.remove());
        const el = root.querySelector('#storyMap');
        try {
          const m = await createMap(el, { assetBase: ctx.A, store, label: 'Map of countries and territories you have visited', countries: { visited: visited.map(c => c.code), limited: limited.map(c => c.code), want: want.map(c => c.code) } });
          ctx.cleanups.push(() => m.destroy());
          await m.setPins(cs.filter(c => Number.isFinite(c.lat) && !['Visited', 'Limited visit', 'Want to go'].includes('x')).map(c => ({ id: c.code, name: c.name + ' · ' + c.status, lat: c.lat, lon: c.lon, color: c.status === 'Visited' ? '#2f6b52' : c.status === 'Limited visit' ? '#c39a55' : '#d9c79f' })), code => ctx.nav('/story/' + encodeURIComponent(code)));
        } catch (e) { el.innerHTML = '<p class="map-fail">Map unavailable on this device. Your countries are listed below.</p>'; }
      },
    };
  },
};

export const country = {
  render(ctx) {
    const c = ctx.store.get('country', ctx.route.params.code);
    if (!c) return { title: 'Not found', html: '<section class="page narrow"><h1>Not in your travel story.</h1><a class="btn" href="/story">Travel story</a></section>' };
    const places = ctx.store.list('place').filter(p => countryMatch(p, c));
    return {
      title: c.name,
      html: '<section class="page narrow"><a class="back" href="/story">' + icon('back') + ' Travel story</a><p class="eyebrow">Country or territory history</p><h1>' + esc(c.name) + '</h1><p class="muted">' + esc(c.source || '') + '</p>' +
        (c.code === 'GB-ENG' ? '<p class="notice">England only. Visits to Scotland, Wales or Northern Ireland are recorded separately.</p>' : '') + (c.code === 'KP' ? '<p class="notice">Recorded as a limited visit (JSA only), not a full country visit.</p>' : '') +
        '<form class="grid-form" data-form="countrySave"><input type="hidden" name="code" value="' + esc(c.code) + '">' + field(['status', 'Status', 'select', COUNTRY_STATUSES], c.status) + field(['revisit', 'More I would like to see', 'checkbox'], !!c.revisit) + field(['notes', 'Memories and places still to see', 'textarea'], c.notes) + '<div class="wide row end"><button class="btn primary">Save</button></div></form>' +
        '<h2>Places here in your atlas</h2><p class="muted">Each keeps its own visit status.</p><ul class="rows">' + (places.map(p => '<li><a class="row-item" href="/place/' + esc(p.id) + '"><span><strong>' + esc(p.name) + '</strong><small>' + esc(p.status || 'Unconfirmed') + '</small></span>' + icon('arrow') + '</a></li>').join('') || '<li class="muted">No specific places yet.</li>') + '</ul><a class="btn ghost" href="/place/new">' + icon('plus') + ' Add a specific place</a></section>',
    };
  },
};

export const forms = {
  async countrySave(f, ctx) { const v = formValues(f), code = v.code; delete v.code; await ctx.store.patch('country', code, v); toast('Saved on this device'); },
  async countryAdd(f, ctx) {
    const v = formValues(f), name = v.name.trim();
    if (ctx.store.list('country').some(c => c.name.toLowerCase() === name.toLowerCase())) throw new Error(name + ' is already in your travel story.');
    await ctx.store.create('country', { code: 'NEW-' + Date.now().toString(36).toUpperCase(), name, region: 'Other', lat: null, lon: null, status: v.status, revisit: false, notes: '', source: 'Added by you. Country or territory level only.' });
    f.reset(); toast(name + ' added');
  },
};
export const actions = {};

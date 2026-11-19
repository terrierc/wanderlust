// Cached exchange rates for the optional AUD estimate (ECB reference rates via Frankfurter).
import { esc } from './kit.js';
import { money } from '../core/domain.js';
export async function getRates(ctx) {
  let r = ctx.store.meta.rates;
  const old = !r || Date.now() - Date.parse(r.fetched) > 12 * 3600e3;
  if (old && navigator.onLine !== false && !ctx.sync.localOnly) { try { r = await ctx.sync.request('/api/rates'); await ctx.store.setMeta('rates', r); } catch {} }
  return r || null;
}
export function audBlock(a, r) {
  if (!r) return '<p class="notice">No exchange rates on this device yet. Needs a connection once; after that the last rates work offline.</p>';
  return '<div class="notice"><p><b>AUD estimate</b>: low ' + money(Math.round(a.low), 'AUD') + ' · likely ' + money(Math.round(a.likely), 'AUD') + ' · high ' + money(Math.round(a.high), 'AUD') + '</p><p class="small">Estimate only, using ' + esc(r.source) + ' for ' + esc(r.date) + ', fetched ' + esc(new Date(r.fetched).toLocaleDateString('en-AU')) + (r.stale ? ' (could not refresh)' : '') + '. The original currencies above are the real figures.' + (a.missing.length ? ' Not included (no rate available): ' + esc(a.missing.join(', ')) + '.' : '') + (a.unknown ? ' ' + a.unknown + ' unpriced item(s) not included.' : '') + '</p></div>';
}

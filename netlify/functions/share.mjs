// Read-only trip links.
//   Behind the passphrase gate: GET /shares (list), POST /shares (create), DELETE /shares/<fp> (revoke),
//   POST /shares/<fp>/replace (new link, same settings; the old one stops working).
//   Public (the link itself is the key): GET /s/<token> (page), /s/<token>/data.json (that trip only), /s/sw.js.
// Only a SHA-256 fingerprint of each token is stored (shares/index.json), so stored data cannot rebuild a link.
import { getStore } from '@netlify/blobs';
import { internals } from '../../dist/netlify-server/index.mjs';
import { netlifyBucket } from '../../server/netlify-bucket.mjs';
import { buildSnapshot, newToken, fingerprint, TOKEN_RE, expired, SHARE_DEFAULTS } from '../../src/core/share.js';
import EMERGENCY from '../../plan/emergency.json' with { type: 'json' };

const INDEX = 'shares/index.json';
const melDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.WANDERLUST_TIMEZONE || 'Australia/Melbourne' }).format(new Date());
const json = (b, status = 200, extra = {}) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-cache', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', ...extra } });
const env = () => ({ BUCKET: netlifyBucket(getStore({ name: 'elsewhere', consistency: 'strong' })) });
const readIndex = async e => (await internals.readJSON(e, INDEX))?.body?.links || [];
const writeIndex = (e, links) => e.BUCKET.put(INDEX, JSON.stringify({ links }), { httpMetadata: { contentType: 'application/json' } });
const clean = l => ({ fp: l.fp, trip: l.trip, label: l.label, include: l.include, created: l.created, expires: l.expires || '', lastOpened: l.lastOpened || '' });

export async function handle(req, e = env(), today = melDate()) {
  const u = new URL(req.url), p = u.pathname;
  // ---------- public ----------
  if (p === '/s/sw.js') return new Response(SW, { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/s/' } });
  const m = p.match(/^\/s\/([A-Za-z0-9_-]{43})(\/data\.json)?\/?$/);
  if (m) {
    if (!m[2]) return new Response(PAGE, { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
    const fp = await fingerprint(m[1]), links = await readIndex(e), rec = links.find(l => l.fp === fp);
    if (!rec) return json({ error: 'This link is not active. Ask the person who shared it for a new one.' }, 404);
    if (expired(rec, today)) return json({ error: 'This link has expired. Ask the person who shared it for a new one.', expired: true }, 410);
    const { docs } = await internals.loadSyncDocs(e), snap = buildSnapshot(docs, rec.trip, rec.include, EMERGENCY);
    if (!snap) return json({ error: 'This trip is no longer available.' }, 404);
    if (rec.lastOpened !== today) { rec.lastOpened = today; await writeIndex(e, links); } // date only: no IP or device details
    return json({ ...snap, sharedWith: rec.label });
  }
  // ---------- management (the gate has already checked the passphrase) ----------
  if (!/^\/shares(\/|$)/.test(p)) return json({ error: 'Not found' }, 404);
  if (req.method !== 'GET') { const o = req.headers.get('Origin'); if (o && new URL(o).host !== u.host) return json({ error: 'Wrong origin' }, 403); }
  const links = await readIndex(e);
  if (req.method === 'GET' && p === '/shares') return json({ links: links.map(clean) });
  if (req.method === 'POST' && p === '/shares') {
    const b = await req.json().catch(() => ({})), label = String(b.label || '').trim().slice(0, 60), trip = String(b.trip || '');
    if (!label || !trip) return json({ error: 'Add who the link is for.' }, 400);
    const { docs } = await internals.loadSyncDocs(e); if (!(docs.profile?.trips || []).some(t => t.id === trip)) return json({ error: 'That trip has not synced yet. Sync, then try again.' }, 409);
    const include = { money: !!b.include?.money, refs: !!b.include?.refs, policy: b.include?.policy !== false };
    const expires = /^\d{4}-\d{2}-\d{2}$/.test(b.expires || '') ? b.expires : '';
    const token = newToken(), rec = { fp: await fingerprint(token), trip, label, include, created: today, expires, lastOpened: '' };
    links.push(rec); await writeIndex(e, links);
    return json({ link: clean(rec), url: u.origin + '/s/' + token });
  }
  const r = p.match(/^\/shares\/([a-f0-9]{64})(\/replace)?$/); if (!r) return json({ error: 'Not found' }, 404);
  const i = links.findIndex(l => l.fp === r[1]); if (i < 0) return json({ error: 'That link was already revoked.' }, 404);
  if (req.method === 'DELETE' && !r[2]) { links.splice(i, 1); await writeIndex(e, links); return json({ revoked: true }); }
  if (req.method === 'POST' && r[2]) {
    const token = newToken(), rec = { ...links[i], fp: await fingerprint(token), created: today, lastOpened: '' };
    links.splice(i, 1, rec); await writeIndex(e, links);
    return json({ link: clean(rec), url: u.origin + '/s/' + token });
  }
  return json({ error: 'Not allowed' }, 405);
}
export default req => handle(req);
export const config = { path: ['/s/*', '/shares', '/shares/*'] };

// Offline: the page and its last trip snapshot are kept on the phone after the first open.
const SW = `const C='wanderlust-share-v1';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||!/^\\/s\\/[A-Za-z0-9_-]{43}/.test(u.pathname))return;
e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));}else if(r.status===404||r.status===410){caches.open(C).then(x=>x.delete(e.request));}return r;}).catch(()=>caches.match(e.request).then(h=>h||new Response(JSON.stringify({error:'No connection, and nothing saved on this phone yet.'}),{status:503,headers:{'Content-Type':'application/json'}}))));});`;

const PAGE = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Trip plan · Wanderlust</title>
<style>
:root{--bg:#f8f2ea;--card:#fff;--ink:#1c1630;--muted:#5f5776;--line:#e4d7c6;--accent:#b0450e;--night:#15112b;--tint:#fbe4df}
@media (prefers-color-scheme:dark){:root{--bg:#06050d;--card:#13122d;--ink:#efeaf8;--muted:#aaa3c8;--line:#2c2955;--accent:#ffaa66;--tint:#311518}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}
header{background:linear-gradient(180deg,#0c0a1d,#1a1340);color:#f4f0ff;padding:28px 16px 22px;border-bottom:3px solid;border-image:linear-gradient(90deg,#ff8a3d,#e0457b,#7b4dff) 1}
header p{margin:0;color:#d6ceef;font-size:.85rem;letter-spacing:.12em;text-transform:uppercase}h1{font:400 clamp(1.9rem,7vw,2.6rem)/1.1 Georgia,serif;margin:6px 0}h2{font:400 1.35rem Georgia,serif;margin:0 0 10px}
main{max-width:760px;margin:0 auto;padding:16px}section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:0 0 14px}
ul{list-style:none;margin:0;padding:0}li{padding:8px 0;border-bottom:1px solid var(--line)}li:last-child{border:0}.muted{color:var(--muted);font-size:.88rem}
.nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.nums div{background:var(--tint);border-radius:12px;padding:10px}.nums b{display:block;font-size:1.2rem}
a{color:var(--accent)}.note{background:var(--tint);border-radius:12px;padding:10px 12px}.big{font-weight:600;font-size:1.05rem}
@media print{header{background:none;color:#000}section{break-inside:avoid}}
</style></head><body><header><p>Read-only trip plan</p><h1 id="t">Loading…</h1><div id="sub"></div></header><main id="m"><section><p class="muted">Loading the latest plan…</p></section></main>
<script>
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const D=d=>{if(!d)return'';try{return new Date(d+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}catch(e){return d}};
const tel=n=>'<a href="tel:'+E(String(n).split(' or ')[0].replace(/[^+\\d]/g,''))+'">'+E(n)+'</a>';
const sec=(h,b)=>b?'<section><h2>'+h+'</h2>'+b+'</section>':'';
if('serviceWorker' in navigator)navigator.serviceWorker.register('/s/sw.js',{scope:'/s/'}).catch(()=>{});
const DU=location.pathname.replace(/\\/$/,'')+'/data.json';
fetch(DU,{cache:'no-cache'}).then(r=>r.json().then(j=>[r,j])).then(([r,j])=>{
 if(r.ok&&!j.error&&'caches' in window)caches.open('wanderlust-share-v1').then(c=>Promise.all([c.add(location.pathname),c.put(DU,new Response(JSON.stringify(j),{headers:{'Content-Type':'application/json'}}))])).catch(()=>{});
 if(j.error){document.getElementById('t').textContent='Trip plan';document.getElementById('m').innerHTML='<section><p class="big">'+E(j.error)+'</p></section>';return;}
 const t=j.trip;document.title=t.name+' · Wanderlust';document.getElementById('t').textContent=t.name;
 document.getElementById('sub').innerHTML='<div>'+E(t.lengthNote||'')+'</div><div class="muted" style="color:#d6ceef">'+E(j.travellers.join(', '))+(j.sharedWith?' · shared with '+E(j.sharedWith):'')+'</div>';
 const off=r.headers.get('X-From-Cache');let h='<p class="muted">Updated '+E(new Date(j.builtAt).toLocaleString('en-AU'))+'. Saved on this phone, so it opens without a connection.</p>';
 h+=sec('Route',j.route.length?'<ul>'+j.route.map(s=>'<li>'+E(s.name)+' · '+E(s.nights)+' night'+(s.nights>1?'s':'')+'</li>').join('')+'</ul>':'');
 h+=sec('Flights and connections',(j.flights.length||j.connections.length)?'<ul>'+j.flights.map(f=>'<li><b>'+E(f.title)+'</b>'+(f.date?' · '+D(f.date):'')+(f.reference?' · ref '+E(f.reference):'')+'</li>').join('')+j.connections.map(c=>'<li><b>'+E(c.from)+' → '+E(c.to)+'</b>'+(c.mode?' · '+E(c.mode):'')+(c.date?' · '+D(c.date)+(c.departTime?' '+E(c.departTime):''):'')+(c.operator?' · '+E(c.operator):'')+(c.notes?'<div class="muted">'+E(c.notes)+'</div>':'')+'</li>').join('')+'</ul>':'');
 h+=sec('Where we sleep',j.stays.length?'<ul>'+j.stays.map(s=>'<li><b>'+(s.date?D(s.date):'')+(s.end?' – '+D(s.end):'')+'</b> · '+E(s.title)+(s.address?'<div>'+E(s.address)+'</div>':'')+(s.phone?'<div>'+tel(s.phone)+'</div>':'')+(s.reference?'<div class="muted">Ref '+E(s.reference)+'</div>':'')+'</li>').join('')+'</ul>':'<p class="muted">Not booked yet.</p>');
 h+=sec('Day by day',j.days.length?'<ul>'+j.days.map(d=>'<li><b>'+E(d.title)+'</b>'+(d.date?' · '+D(d.date):'')+(d.location?'<div class="muted">'+E(d.location)+'</div>':'')+(d.notes?'<div>'+E(d.notes)+'</div>':'')+'</li>').join('')+'</ul>':'');
 const em=j.emergency;if(em){let b='';if(em.consular)b+='<p class="note big">'+E(em.consular.label)+': '+tel(em.consular.overseas)+' from overseas</p>';
  for(const c of em.countries){b+='<h3>'+E(c.name)+'</h3>';if(c.missing){b+='<p class="muted">No verified details stored yet.</p>';continue;}
   b+='<div class="nums">'+c.emergency.map(([l,n])=>'<div><span class="muted">'+E(l)+'</span><b>'+tel(n)+'</b></div>').join('')+'</div>'+c.missions.map(x=>'<p><b>'+E(x.name)+'</b><br>'+E(x.address)+'<br>'+tel(x.phone)+'</p>').join('')+'<p class="muted">From <a href="'+E(c.source)+'" rel="noopener noreferrer" target="_blank">Smartraveller</a>, checked '+D(c.checked)+'. Check the latest advice before you travel.</p>';}
  const i=em.insurance||{};b+='<h3>Travel insurance</h3>'+(i.insurer||i.policyNumber||i.insurerPhone?'<p>'+E(i.insurer||'')+(i.policyNumber?'<br>Policy '+E(i.policyNumber):'')+(i.insurerPhone?'<br>Emergency line '+tel(i.insurerPhone):'')+'</p>':'<p class="muted">Not added yet.</p>');
  h+=sec('Emergency card',b);}
 if(j.money){h+=sec('Money',(j.money.estimates.length?'<ul>'+j.money.estimates.map(c=>'<li>'+E(c.item)+' · '+E(c.currency)+' '+E(c.total??'unknown')+'</li>').join('')+'</ul>':'')+(j.money.spent.length?'<h3>Spent</h3><ul>'+j.money.spent.map(s=>'<li>'+D(s.date)+' · '+E(s.currency)+' '+E(s.amount)+' · '+E(s.category)+' · '+E(s.paidBy)+'</li>').join('')+'</ul>':''));}
 h+='<p class="muted">This is a read-only copy of a plan made in Wanderlust. Nothing here can be changed from this page.</p>';
 document.getElementById('m').innerHTML=h;
}).catch(()=>{document.getElementById('t').textContent='Trip plan';document.getElementById('m').innerHTML='<section><p class="big">No connection, and this plan has not been saved on this phone yet. Open the link once while online.</p></section>';});
</script></body></html>`;

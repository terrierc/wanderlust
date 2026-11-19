// Builds the Wanderlust Worker (site), the service worker and a packaged offline client.
// Every runtime dependency is bundled locally: no CDN, no remote tiles, no remote fonts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const read = p => fs.readFile(p, 'utf8');
const hash = b => createHash('sha256').update(b).digest('hex');
const TYPES = { '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.json': 'application/json', '.geojson': 'application/geo+json', '.woff2': 'font/woff2', '.pbf': 'application/x-protobuf', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.html': 'text/html;charset=utf-8', '.txt': 'text/plain;charset=utf-8', '.webmanifest': 'application/manifest+json' };
const TEXT = new Set(['.js', '.css', '.json', '.geojson', '.svg', '.html', '.txt', '.webmanifest']);
async function walk(dir) { const out = []; for (const e of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...await walk(p)); else out.push(p); } return out; }

// ---------- data ----------
const places = JSON.parse(await read('destinations.json'));
const forty = JSON.parse(await read('forty.json'));
const profileSeed = JSON.parse(await read('profile-seed.json'));
const photos = JSON.parse(await read('photos-ready.json'));
const plan = JSON.parse(await read('plan/forty-plan.json'));
{ const { validatePlan } = await import('./src/core/plan.js'); const errs = validatePlan(plan, forty); if (errs.length) { console.error('The 40 before 40 plan is invalid:\n - ' + errs.join('\n - ')); process.exit(1); } }

// ---------- photographs (immutable, content-hashed) ----------
const images = {}; const imagePath = {};
const neededImages = new Set([...Object.values(photos).map(p => p.src.split('/').pop()), 'hero-lofoten.webp', 'hero-iceland.webp', 'hero-sardinia.webp']);
for (const name of (await fs.readdir('assets/web')).sort()) {
  if (!neededImages.has(name)) continue;
  const bytes = await fs.readFile('assets/web/' + name);
  const p = '/images/' + name.replace('.webp', '-' + hash(bytes).slice(0, 10) + '.webp');
  images[p] = bytes; imagePath['/images/' + name] = p;
}
for (const p of Object.values(photos)) { p.bytes = images[imagePath[p.src]]?.length || null; p.src = imagePath[p.src]; }
const sceneCredit = id => photos[id] ? photos[id].credit + ' · ' + photos[id].license : '';
const scenes = [
  { src: imagePath['/images/hero-lofoten.webp'], alt: 'Mountains and fjords seen from Reinebringen in Lofoten, Norway', place: 'Lofoten Islands, Norway', credit: sceneCredit('d001') },
  { src: imagePath['/images/hero-iceland.webp'], alt: 'Skógafoss waterfall between green cliffs in Iceland', place: 'South coast of Iceland', credit: sceneCredit('d005') },
  { src: imagePath['/images/hero-sardinia.webp'], alt: 'Turquoise sea and limestone cliffs on the coast of Sardinia', place: 'Sardinia, Italy', credit: sceneCredit('d008') },
];

// ---------- client assets ----------
const files = {}; // relative path under the build folder -> Buffer
for (const f of await walk('src')) { const rel = path.relative('src', f); if (rel === 'index.html' || rel === 'sw.js') continue; files[rel] = await fs.readFile(f); }
files['vendor/maplibre-gl.js'] = await fs.readFile('node_modules/maplibre-gl/dist/maplibre-gl.js');
files['vendor/maplibre-gl.css'] = await fs.readFile('node_modules/maplibre-gl/dist/maplibre-gl.css');
files['vendor/pmtiles.js'] = await fs.readFile('node_modules/pmtiles/dist/pmtiles.js');
files['vendor/basemaps.js'] = await fs.readFile('node_modules/@protomaps/basemaps/dist/esm/index.js');
for (const f of await walk('assets/fonts')) files['fonts/' + path.basename(f)] = await fs.readFile(f);
for (const f of await walk('assets/map/glyphs')) if (f.endsWith('.pbf')) files['fonts/' + path.relative('assets/map/glyphs', f)] = await fs.readFile(f);
for (const f of await walk('assets/map/sprites')) files['sprites/' + path.basename(f)] = await fs.readFile(f);
for (const f of await walk('maps')) files['maps/' + path.basename(f)] = await fs.readFile(f);
for (const f of await walk('assets/icons')) files['icons/' + path.basename(f)] = await fs.readFile(f);
if (process.env.WANDERLUST_BUILD_SALT) files['data/build-salt.txt'] = Buffer.from(process.env.WANDERLUST_BUILD_SALT);
files['data/seed.json'] = Buffer.from(JSON.stringify({ places, profile: profileSeed, forty, photos, scenes, plan }));

const BUILD = hash(Buffer.concat(Object.keys(files).sort().map(k => Buffer.concat([Buffer.from(k), files[k]])))).slice(0, 12);
const A = '/app/' + BUILD + '/';
const enc = rel => A + rel.split('/').map(s => encodeURIComponent(s).replace(/%40/g, '@')).join('/');

const shell = (mode, extra = {}) => read('src/index.html').then(t => t.replaceAll('__A__', A).replace('__CONFIG__', JSON.stringify({ build: BUILD, mode, assetBase: A, ...extra }).replaceAll('<', '\\u003c')));
const siteHTML = await shell('site');
const precache = ['/', ...Object.keys(files).filter(k => !k.startsWith('icons/apple')).map(enc)];
const sw = (await read('src/sw.js')).replace('__BUILD__', BUILD).replace('__PRECACHE__', JSON.stringify(precache));
const manifest = JSON.stringify({
  id: '/', name: 'Wanderlust', short_name: 'Wanderlust', description: 'A private travel atlas and journey planner.', start_url: '/?source=app', scope: '/', display: 'standalone', orientation: 'any', background_color: '#f4f0e6', theme_color: '#0e2721', lang: 'en-AU',
  icons: [{ src: A + 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: A + 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: A + 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
  shortcuts: [{ name: 'Today', url: '/today', icons: [{ src: A + 'icons/icon-192.png', sizes: '192x192' }] }, { name: 'Journeys', url: '/journeys' }, { name: '40 before 40', url: '/forty' }],
});

// ---------- Worker ----------
const ASSETS = {};
for (const [rel, buf] of Object.entries(files)) { const ext = path.extname(rel); ASSETS[enc(rel)] = TEXT.has(ext) ? { t: TYPES[ext], s: buf.toString('utf8') } : { t: TYPES[ext] || 'application/octet-stream', b: buf.toString('base64') }; }
for (const [p, buf] of Object.entries(images)) ASSETS[p] = { t: 'image/webp', b: buf.toString('base64') };
const model = (await read('src/core/model.js')).replace(/^export /gm, '');
const server = model + '\n' + (await Promise.all(['profile-api.js', 'hub-api.js', 'travel-mcp.js', 'forty-api.js', 'server/sync-api.js'].map(read))).join('\n');
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'";
const API_FETCH = `async function apiFetch(req,env,u){if(!env.BUCKET)return json({error:'Storage not configured'},503);
  for(const h of [handleSync,handleFeed,handleRates,handlePush,handleMaps,handleForty,handleHub,handleProfile]){const r=await h(req,env,u);if(r)return r}
  if(req.method==='GET'&&u.pathname==='/api/state'){try{let cursor,objects=[];do{const p=await env.BUCKET.list({prefix:'atlas/',cursor});objects.push(...p.objects);cursor=p.truncated?p.cursor:undefined}while(cursor);if(objects.length>1500)return json({error:'Catalogue limit reached'},413);const result=[];for(let i=0;i<objects.length;i+=20){const batch=await Promise.all(objects.slice(i,i+20).map(async x=>{const o=await env.BUCKET.get(x.key);return o?o.json():null}));result.push(...batch.filter(Boolean))}return json(result.filter(p=>!p.deleted))}catch(e){return json({error:'Could not read atlas'},500)}}
  if(u.pathname.startsWith('/api/place/')){if(req.headers.get('Origin')!==u.origin)return json({error:'Origin not allowed'},403);const id=decodeURIComponent(u.pathname.slice(11));if(!/^[a-zA-Z0-9-]{1,90}$/.test(id))return json({error:'Invalid id'},400);
   try{const old=await env.BUCKET.get('atlas/'+id+'.json'),match=req.headers.get('If-Match');if(match&&normEtag(match)!==normEtag(old?.httpEtag||'"empty"'))return json({error:'This place changed on another device. Reload before saving.'},409);
    if(req.method==='DELETE'){const saved=await env.BUCKET.put('atlas/'+id+'.json',JSON.stringify({id,deleted:true,deletedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'},onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'}});return saved?json({saved:true}):json({error:'A concurrent change was saved. Reload.'},409)}
    if(req.method!=='PUT')return json({error:'Method not allowed'},405);
    const text=await req.text();if(text.length>100000)return json({error:'Record too large'},413);const p=JSON.parse(text);if(p.id!==id||validatePlace(p)||p.deleted)return json({error:'Invalid place'},400);
    const saved=await env.BUCKET.put('atlas/'+id+'.json',JSON.stringify(p),{httpMetadata:{contentType:'application/json'},onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'}});if(!saved)return json({error:'A concurrent change was saved. Reload before saving.'},409);return new Response(JSON.stringify({saved:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','ETag':saved.httpEtag}})}catch(e){return json({error:'Could not save place'},500)}}
  return json({error:'Not found'},404)}
`;
const worker = `const BUILD_ID=${JSON.stringify(BUILD)};const HTML=${JSON.stringify(siteHTML)};const SW=${JSON.stringify(sw)};const MANIFEST=${JSON.stringify(manifest)};const ASSETS=${JSON.stringify(ASSETS)};
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const PROFILE_SEED=${JSON.stringify(profileSeed)};const FORTY=${JSON.stringify(forty)};const PLACES_SEED=${JSON.stringify(places)};
${server}
const APP_ROUTE=/^\\/($|index\\.html$|explore|place|plan|journeys|wallet|settle|deals|documents|forty|story|today|search|more|prepare)(\\/|$|\\?)/;
const SEC={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
${API_FETCH}
function decodeAsset(a){if(a.s!==undefined)return a.s;const raw=atob(a.b);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
export default {async fetch(req,env){const u=new URL(req.url);
 const mcpResponse=await handleTravelMCP(req,env,u);if(mcpResponse)return mcpResponse;
 const asset=ASSETS[u.pathname];if(asset&&(req.method==='GET'||req.method==='HEAD'))return new Response(req.method==='HEAD'?null:decodeAsset(asset),{headers:{'Content-Type':asset.t,'Cache-Control':'private, max-age=31536000, immutable',...SEC}});
 if(u.pathname==='/sw.js')return new Response(SW,{headers:{'Content-Type':'text/javascript;charset=utf-8','Cache-Control':'no-cache','Service-Worker-Allowed':'/',...SEC}});
 if(u.pathname==='/manifest.webmanifest')return new Response(MANIFEST,{headers:{'Content-Type':'application/manifest+json','Cache-Control':'no-cache',...SEC}});
 if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/maps/')||u.pathname.startsWith('/feed/'))return apiFetch(req,env,u);
 if((req.method==='GET'||req.method==='HEAD')&&APP_ROUTE.test(u.pathname))return new Response(req.method==='HEAD'?null:HTML,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-cache','Content-Security-Policy':${JSON.stringify(CSP)},...SEC}});
 return new Response('Not found',{status:404,headers:SEC})}};`;
await fs.mkdir('worker', { recursive: true }); await fs.mkdir('dist/server', { recursive: true });
await fs.writeFile('worker/index.js', worker); await fs.writeFile('dist/server/index.js', worker);

// ---------- packaged offline client (for the desktop shell) ----------
const pkg = 'dist/packaged';
await fs.rm(pkg, { recursive: true, force: true });
for (const [rel, buf] of Object.entries(files)) { const out = path.join(pkg, 'app', BUILD, rel); await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, buf); }
for (const [p, buf] of Object.entries(images)) { const out = path.join(pkg, p); await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, buf); }
await fs.writeFile(path.join(pkg, 'index.html'), (await shell('packaged')).replace(/<link rel="manifest"[^>]*>\n?/, ''));
await fs.writeFile('dist/build.json', JSON.stringify({ build: BUILD, files: Object.keys(files).length, images: Object.keys(images).length, workerBytes: Buffer.byteLength(worker), precache: precache.length }, null, 2));
console.log('Built', BUILD, '·', places.length, 'destinations ·', Object.keys(photos).length, 'photos ·', Object.keys(files).length, 'app files · worker', (Buffer.byteLength(worker) / 1048576).toFixed(1), 'MB');

// ---------- Netlify target: static app + one API function + passphrase gate (netlify.toml) ----------
{
  const out = 'dist/netlify', regionsDir = '../vendor-src/regions', catalog = [];
  await fs.rm(out, { recursive: true, force: true });
  for (const [rel, buf] of Object.entries(files)) { const o = path.join(out, 'app', BUILD, rel); await fs.mkdir(path.dirname(o), { recursive: true }); await fs.writeFile(o, buf); }
  for (const [p, buf] of Object.entries(images)) { const o = path.join(out, p); await fs.mkdir(path.dirname(o), { recursive: true }); await fs.writeFile(o, buf); }
  // Detailed map regions ship as static files (HTTP range requests work on Netlify's CDN, behind the same gate).
  for (const f of (await fs.readdir(regionsDir).catch(() => [])).filter(f => f.endsWith('.pmtiles'))) {
    const id = f.replace('.pmtiles', ''), bytes = await fs.readFile(path.join(regionsDir, f)), meta = JSON.parse(await read(path.join(regionsDir, id + '.json')));
    await fs.mkdir(path.join(out, 'maps'), { recursive: true }); await fs.writeFile(path.join(out, 'maps', f), bytes);
    catalog.push({ id, name: meta.name, bounds: meta.bounds, minzoom: meta.minzoom ?? 0, maxzoom: meta.maxzoom, bytes: bytes.length, sha256: hash(bytes), built: meta.built || '', attribution: meta.attribution });
  }
  await fs.writeFile(path.join(out, 'index.html'), await shell('site', { host: 'netlify', maxUpload: 5_500_000 }));
  await fs.writeFile(path.join(out, 'sw.js'), sw); await fs.writeFile(path.join(out, 'manifest.webmanifest'), manifest);
  const lite = `const BUILD_ID=${JSON.stringify(BUILD)};const STATIC_MAPS=${JSON.stringify(catalog)};
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const PROFILE_SEED=${JSON.stringify(profileSeed)};const FORTY=${JSON.stringify(forty)};const PLACES_SEED=${JSON.stringify(places)};
${server}
${API_FETCH}
export default {async fetch(req,env){const u=new URL(req.url);const m=await handleTravelMCP(req,env,u);if(m)return m;if(req.method==='GET'&&u.pathname==='/api/maps')return json({regions:STATIC_MAPS});if(u.pathname.startsWith('/feed/'))return (await handleFeed(req,env,u))||new Response('Not found',{status:404});return apiFetch(req,env,u)}};\nexport const internals={loadSyncDocs,keyDates,readJSON};`;
  await fs.mkdir('dist/netlify-server', { recursive: true }); await fs.writeFile('dist/netlify-server/index.mjs', lite);
  console.log('Netlify target:', catalog.length, 'map regions,', (Buffer.byteLength(lite) / 1024).toFixed(0), 'KB API function');
}

// Cut a detailed offline map region from the Protomaps daily OpenStreetMap build (ODbL; offline use permitted
// with attribution). Requires the `pmtiles` CLI (brew install pmtiles). Never scrape tile.openstreetmap.org.
//   node scripts/make-region.mjs <id> "<Name>" <minLon,minLat,maxLon,maxLat> [maxzoom=14] [outDir=../vendor-src/regions]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [id, name, bbox, maxzoom = '14', out = '../vendor-src/regions'] = process.argv.slice(2);
if (!/^[a-z0-9-]{1,60}$/.test(id || '') || !name || !/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(bbox || '')) { console.error('Usage: node scripts/make-region.mjs lofoten "Lofoten Islands, Norway" 12.7,67.75,15.7,68.65 14'); process.exit(1); }
const builds = await (await fetch('https://build-metadata.protomaps.dev/builds.json')).json();
const latest = builds.at(-1).key;
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, id + '.pmtiles');
execFileSync('pmtiles', ['extract', 'https://build.protomaps.com/' + latest, file, '--bbox=' + bbox, '--maxzoom=' + maxzoom], { stdio: 'inherit' });
fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify({ name, bounds: bbox.split(',').map(Number), minzoom: 0, maxzoom: +maxzoom, built: latest.slice(0, 4) + '-' + latest.slice(4, 6) + '-' + latest.slice(6, 8), source: 'Protomaps build ' + latest, attribution: '© OpenStreetMap contributors · Protomaps' }, null, 2));
console.log('Wrote', file, (fs.statSync(file).size / 1048576).toFixed(1), 'MB. Upload it from Elsewhere → More → Offline & downloads.');

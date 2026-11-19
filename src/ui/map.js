// Maps that work without a network: a bundled Natural Earth overview everywhere, plus detailed
// OpenStreetMap regions read directly from PMTiles archive bytes stored in IndexedDB.
// Straight route lines show order only; they are not directions.
import { layers as pmLayers, namedFlavor } from '../vendor/basemaps.js';

let libs; const reads = (globalThis.__elsewhereMapReads ??= { local: 0, regions: {} });
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Map engine could not load')); document.head.append(s); }); }
export async function mapLibs(assetBase) {
  return (libs ??= (async () => {
    if (!document.querySelector('link[data-maplibre]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = assetBase + 'vendor/maplibre-gl.css'; l.dataset.maplibre = '1'; document.head.append(l); }
    await loadScript(assetBase + 'vendor/maplibre-gl.js'); await loadScript(assetBase + 'vendor/pmtiles.js');
    const protocol = new pmtiles.Protocol(); maplibregl.addProtocol('pmtiles', protocol.tile);
    return { maplibregl, pmtiles, protocol, added: new Set() };
  })());
}

class BlobSource {
  constructor(key, blob) { this.key = key; this.blob = blob; }
  getKey() { return this.key; }
  async getBytes(offset, length) { reads.local++; reads.regions[this.key] = (reads.regions[this.key] || 0) + 1; return { data: await this.blob.slice(offset, offset + length).arrayBuffer() }; }
}

const C = { ocean: '#cddcd5', land: '#f1ecdc', line: '#a9a58f', lake: '#cddcd5', visited: '#2f6b52', limited: '#c39a55', want: '#d9c79f' };
function flavor() { const f = { ...namedFlavor('light') }; Object.assign(f, { background: C.land, earth: C.land, water: C.ocean, park_a: '#dfe6cf', park_b: '#d6e0c4', wood_a: '#dbe3cb', wood_b: '#d2dcc0' }); return f; }

export async function createMap(el, { assetBase, store, center = [12, 22], zoom = 1.3, interactive = true, countries = null, label = 'Map' }) {
  const { maplibregl, pmtiles, protocol, added } = await mapLibs(assetBase);
  const regions = (await store.db.all('maps')).filter(r => r.state === 'ready' && r.blob);
  for (const r of regions) if (!added.has(r.id + r.sha256)) { protocol.add(new pmtiles.PMTiles(new BlobSource(r.id, r.blob))); added.add(r.id + r.sha256); }
  const abs = u => new URL(u, location.href).href;
  const style = {
    version: 8,
    glyphs: location.origin + assetBase + 'fonts/{fontstack}/{range}.pbf',
    sprite: abs(assetBase + 'sprites/light'),
    sources: {
      land: { type: 'geojson', data: abs(assetBase + 'maps/land.geojson'), attribution: 'Natural Earth' },
      lakes: { type: 'geojson', data: abs(assetBase + 'maps/lakes.geojson') },
      borders: { type: 'geojson', data: abs(assetBase + 'maps/borders.geojson') },
      pins: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': C.ocean } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': C.land } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': C.lake } },
    ],
  };
  if (countries) {
    style.sources.countries = { type: 'geojson', data: abs(assetBase + 'maps/countries.geojson') };
    style.layers.push({ id: 'countries', type: 'fill', source: 'countries', paint: { 'fill-color': ['match', ['get', 'code'], ...countries.visited.flatMap(c => [c, C.visited]), ...countries.limited.flatMap(c => [c, C.limited]), ...countries.want.flatMap(c => [c, C.want]), 'rgba(0,0,0,0)'], 'fill-opacity': 0.85 } });
  }
  for (const r of regions) {
    const src = 'region-' + r.id; style.sources[src] = { type: 'vector', url: 'pmtiles://' + r.id, attribution: '© OpenStreetMap contributors · Protomaps' };
    for (const l of pmLayers(src, flavor(), { lang: 'en' })) { if (l.type === 'background') continue; style.layers.push({ ...l, id: src + '-' + l.id, minzoom: Math.max(l.minzoom || 0, 5.5) }); }
  }
  style.layers.push(
    { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': C.line, 'line-width': 0.7, 'line-dasharray': [3, 2] } },
    { id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#9a7440', 'line-width': 2, 'line-dasharray': [2, 2] } },
    { id: 'pins-halo', type: 'circle', source: 'pins', paint: { 'circle-radius': ['case', ['get', 'big'], 11, 8], 'circle-color': '#fffaf0', 'circle-opacity': 0.95 } },
    { id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': ['case', ['get', 'big'], 8, 5.5], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#143e33', 'circle-stroke-width': 0.6 } },
  );
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const map = new maplibregl.Map({ container: el, style, center, zoom, minZoom: 0.6, maxZoom: regions.length ? 15 : 8, attributionControl: false, interactive, fadeDuration: reduce ? 0 : 300, cooperativeGestures: matchMedia('(pointer: coarse)').matches, renderWorldCopies: false, dragRotate: false, pitchWithRotate: false });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Base map: Natural Earth' }));
  if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  el.setAttribute('role', 'region'); el.setAttribute('aria-label', label + '. The list beside the map gives the same places for keyboard and screen-reader use.');
  const ready = new Promise(res => map.once('load', res));
  globalThis.__elsewhereLastMap = map;
  const api = {
    map, ready, regions,
    async setPins(pins, onPick) {
      await ready;
      map.getSource('pins').setData({ type: 'FeatureCollection', features: pins.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: p.id, name: p.name, color: p.color, big: !!p.big } })) });
      if (onPick && !api._bound) {
        api._bound = true;
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'pin-pop' });
        map.on('mouseenter', 'pins', e => { map.getCanvas().style.cursor = 'pointer'; const f = e.features[0]; popup.setLngLat(f.geometry.coordinates).setText(f.properties.name).addTo(map); });
        map.on('mouseleave', 'pins', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
        map.on('click', 'pins', e => onPick(e.features[0].properties.id));
      }
    },
    async setRoute(points) { await ready; map.getSource('route').setData({ type: 'FeatureCollection', features: points.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: points.map(p => [p.lon, p.lat]) }, properties: {} }] : [] }); },
    // Zoom deeper only where a detailed region is on this device; elsewhere the overview is the honest limit.
    fit(points, pad = 60) { const pts = points.filter(p => Number.isFinite(p.lat)); if (!pts.length) return; const detailed = pts.every(p => api.coverageAt(p.lon, p.lat)); if (pts.length === 1) { map.jumpTo({ center: [pts[0].lon, pts[0].lat], zoom: detailed ? 9 : 5 }); return; } const b = new maplibregl.LngLatBounds(); pts.forEach(p => b.extend([p.lon, p.lat])); map.fitBounds(b, { padding: pad, maxZoom: detailed ? 11 : 7, animate: !reduce }); },
    coverageAt(lng, lat) { return regions.find(r => lng >= r.bounds[0] && lng <= r.bounds[2] && lat >= r.bounds[1] && lat <= r.bounds[3]); },
    destroy() { map.remove(); },
  };
  return api;
}

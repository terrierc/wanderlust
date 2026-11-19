# Fill missing place photos from Wikipedia lead images hosted on Wikimedia Commons, keeping only
# freely licensed files (CC BY, CC BY-SA, CC0, public domain) and recording credit, licence and source.
# Usage: python3 -I scripts/fill-photos.py <download-dir>
import json, sys, re, html, pathlib, urllib.request, urllib.error, urllib.parse, time, io
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parents[1]; DL = pathlib.Path(sys.argv[1])
UA = {'User-Agent': 'ElsewhereAtlas/2.0 (personal travel app; photo credits kept)'}
TITLES = {'d015': 'Gásadalur', 'd017': 'Oia, Greece', 'd032': 'Pamir Highway', 'd049': ['Deadvlei', 'Sossusvlei', 'Namib-Naukluft National Park'], 'd055': ['Salar de Uyuni', 'Incahuasi Island', 'Eduardo Avaroa Andean Fauna National Reserve'], 'd056': 'Valle de la Luna (Chile)', 'd059': 'Neko Harbour', 'd065': 'Nā Pali Coast State Wilderness Park', 'd067': 'Lake Tekapo', 'd068': 'Abel Tasman National Park', 'd071': 'Marlborough Sounds', 'd082': 'Hegra (Mada\'in Salih)', 'd088': 'Nordenskiöld Land National Park', 'd089': 'Pico do Arieiro', 'd103': 'Lake Baikal', 'd108': 'Sugarloaf Mountain', 'forty-02': 'Grytviken', 'forty-03': 'Torres del Paine National Park', 'forty-06': 'Landmannalaugar', 'forty-08': 'Annapurna Sanctuary', 'forty-09': 'Song-Köl', 'forty-10': 'Altai Tavan Bogd National Park', 'forty-13': 'Volcanoes National Park', 'forty-15': 'Tambopata National Reserve', 'forty-17': 'Moorea', 'forty-36': 'Tsingy de Bemaraha National Park', 'forty-37': 'Ningaloo Coast', 'forty-38': 'Moraine Lake', 'forty-la-digue': 'La Digue', 'reserve-iran': 'Naqsh-e Jahan Square', 'reserve-russia': 'Circum-Baikal Railway'}
TITLES.update({"d071": ["Queen Charlotte Sound / Tōtaranui", "Queen Charlotte Track", "Kenepuru Sound", "Pelorus Sound / Te Hoiere"], "forty-37": ["Ningaloo Coast", "Ningaloo Reef", "Coral Bay, Western Australia", "Cape Range National Park"], "forty-10": ["Khüiten Peak", "Potanin Glacier", "Tavan Bogd"], "egypt-aswan": ["Abu Simbel temples", "Philae"], "egypt-nile": ["Temple of Edfu", "Kom Ombo Temple"], "egypt-luxor": ["Karnak", "Luxor Temple"]})
OK = re.compile(r'^(CC BY(-SA)? [0-9.]+( [a-z]+)?|CC0|Public domain|PD.*)$', re.I)
def get(url):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(15 * (attempt + 1))  # Wikimedia asked us to slow down
    raise RuntimeError('still rate limited')
def api(base, **q): return json.loads(get(base + '?' + urllib.parse.urlencode({**q, 'format': 'json'})))
photos = json.loads((ROOT / 'photos-ready.json').read_text()); added = []
def one(pid, title):
    if True:
        pg = next(iter(api('https://en.wikipedia.org/w/api.php', action='query', prop='pageimages', piprop='name', titles=title, redirects=1)['query']['pages'].values()))
        name = pg.get('pageimage')
        if not name or re.search(r'\.(svg|gif)$|map|locator|flag|logo|coat', name, re.I): print('skip (no photo lead image):', pid, title, name); return False
        info = next(iter(api('https://commons.wikimedia.org/w/api.php', action='query', titles='File:' + name, prop='imageinfo', iiprop='extmetadata|url', iiurlwidth=1280)['query']['pages'].values()))['imageinfo'][0]
        md = info['extmetadata']; lic = md.get('LicenseShortName', {}).get('value', '')
        if not OK.match(lic): print('skip (licence', lic, '):', pid, name); return False
        artist = html.unescape(re.sub('<[^>]+>', '', md.get('Artist', {}).get('value', 'Unknown'))).strip()
        raw = get(info['thumburl']); (DL / (pid + '.bin')).write_bytes(raw)
        im = Image.open(io.BytesIO(raw)).convert('RGB'); w, h = im.size; tw, th = 1200, 800
        s = max(tw / w, th / h); im = im.resize((round(w * s), round(h * s)), Image.LANCZOS); l, t = (im.width - tw) // 2, (im.height - th) // 2; im = im.crop((l, t, l + tw, t + th)).resize((800, 533), Image.LANCZOS)
        out = ROOT / 'assets/web' / (pid + '.webp'); im.save(out, 'WEBP', quality=78, method=6)
        caption = re.sub(r'\.(jpe?g|png|tiff?)$', '', name, flags=re.I).replace('_', ' ')
        photos[pid] = {'id': pid, 'title': caption + (' (' + title + ')' if title.split(',')[0].split(' (')[0].lower() not in caption.lower() else ''), 'src': '/images/' + pid + '.webp', 'credit': artist + ' / Wikimedia Commons', 'page': info['descriptionurl'], 'license': lic + ' · resized and cropped', 'licenseUrl': md.get('LicenseUrl', {}).get('value', ''), 'width': 800, 'height': 533}
        added.append(pid); sys.stdout.flush(); print('ok', pid, '←', name, '|', lic); sys.stdout.flush(); return True
for pid, titles in TITLES.items():
    if pid in photos: continue
    for title in (titles if isinstance(titles, list) else [titles]):
        try:
            if one(pid, title):
                (ROOT / 'photos-ready.json').write_text(json.dumps(photos, ensure_ascii=False, indent=1)); break
        except Exception as e: print('error', pid, title, e)
        finally: time.sleep(4)
(ROOT / 'photos-ready.json').write_text(json.dumps(photos, ensure_ascii=False, indent=1))
print('added', len(added), 'photos; total', len(photos))

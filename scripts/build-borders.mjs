// Builds the app's borders:
//  - 1600 to 1885: snapshots from historical-basemaps by A. Ourednik
//    (https://github.com/aourednik/historical-basemaps), each used until the
//    next one.
//  - 1886 to 2013: CShapes 2.0 (Schvitz et al., ETH Zurich), which dates every
//    border change of states and colonies, so each year gets its own map.
//    Shapes are stored once as TopoJSON with the years they apply to.
//  - 2014 onward: Natural Earth admin-0 countries (public domain), which draws
//    borders by de facto control (Crimea under Russia). This matches the data
//    sources: World Bank figures for Ukraine exclude Crimea from 2014.
//  - A land layer (Natural Earth land) drawn under every map, so land that no
//    state claimed, or that a map leaves out, still shows as land.
// Each feature gets an ENTITY property (ISO3 or historical key, see
// public/data/entities.json) and a RULER property for colonial status.
//
//   node scripts/build-borders.mjs [path/to/historical-basemaps]
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CACHE_DIR, DATA_DIR, ROOT, readJSON, writeJSON, cachedDownload } from './lib/util.mjs';
import { loadResolver } from './lib/entities.mjs';

const FIRST_YEAR = 1600;
const CSHAPES_FROM = 1886; // first year CShapes covers
const CSHAPES_TO = 2013; // Natural Earth from 2014
const OUT = path.join(DATA_DIR, 'borders');
const src = process.argv[2] ?? path.join(CACHE_DIR, 'historical-basemaps');

try {
  await fs.access(src);
} catch {
  console.log('Cloning historical-basemaps...');
  execFileSync('git', ['clone', '--depth', '1', 'https://github.com/aourednik/historical-basemaps.git', src], { stdio: 'inherit' });
}

const files = (await fs.readdir(path.join(src, 'geojson')))
  .map((f) => ({ f, m: f.match(/^world_(\d+)\.geojson$/) }))
  .filter(({ m }) => m && Number(m[1]) >= FIRST_YEAR && Number(m[1]) < CSHAPES_FROM)
  .map(({ f, m }) => ({ file: path.join(src, 'geojson', f), year: Number(m[1]) }))
  .sort((a, b) => a.year - b.year);

// globe.gl / three-globe follow d3-geo's spherical convention: outer rings
// clockwise, holes counter-clockwise. A ring with the other orientation is
// read as "the whole sphere except this shape", so normalize every ring.
function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  return a; // > 0 means clockwise
}
function rewindPolygon(rings) {
  return rings.map((ring, i) => {
    const clockwise = signedArea(ring) > 0;
    return (i === 0) === clockwise ? ring : [...ring].reverse();
  });
}
function rewind(geometry) {
  if (geometry?.type === 'Polygon') return { ...geometry, coordinates: rewindPolygon(geometry.coordinates) };
  if (geometry?.type === 'MultiPolygon') return { ...geometry, coordinates: geometry.coordinates.map(rewindPolygon) };
  return geometry;
}

const { resolve, resolveDataset, countries, entities } = await loadResolver();
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
const mapshaper = path.join(ROOT, 'node_modules/.bin/mapshaper');
const unmatched = new Map();
const snapshots = [];

for (const { file, year } of files) {
  const tmp = path.join(OUT, `_tmp_${year}.json`);
  // Simplify to keep each snapshot small enough to stream to the browser.
  execFileSync(mapshaper, ['-i', file, 'snap', '-clean', 'allow-overlaps', '-simplify', 'visvalingam', 'weighted', '10%', 'keep-shapes',
    '-filter', 'NAME != null && NAME.trim() !== ""', '-o', tmp, 'precision=0.01', 'format=geojson'], { stdio: 'pipe' });
  const gj = await readJSON(tmp);
  await fs.rm(tmp);
  const features = gj.features.filter((f) => f.geometry).map((f) => {
    const p = f.properties;
    const name = p.NAME.trim();
    const entity = resolve(name, year);
    if (!entity) unmatched.set(name, (unmatched.get(name) ?? 0) + 1);
    const ruler = p.SUBJECTO && p.SUBJECTO.trim() !== name ? p.SUBJECTO.trim() : null;
    return {
      type: 'Feature',
      properties: { NAME: name, ENTITY: entity, RULER: ruler, PARTOF: p.PARTOF && p.PARTOF !== name ? p.PARTOF : null },
      geometry: rewind(f.geometry),
    };
  });
  await writeJSON(path.join(OUT, `world_${year}.json`), { type: 'FeatureCollection', features });
  const matched = features.filter((f) => f.properties.ENTITY).length;
  snapshots.push(year);
  console.log(`  ${year}: ${features.length} territories, ${matched} mapped to data entities`);
}

// ---------- Current borders: Natural Earth ----------
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const neFile = await cachedDownload(NE_URL, 'ne_50m.geojson');
// Natural Earth codes that differ from the data's codes.
const NE_CODES = {
  SDS: 'SSD', KOS: 'XKX', PSX: 'PSE', SAH: 'ESH',
  SOL: 'PART:SOM', CYN: 'PART:CYP', ALD: 'PART:FIN', IOA: 'PART:AUS', ATC: 'PART:AUS', KAS: null,
};
const SIMFEROPOL = [34.1, 44.95];
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
async function naturalEarthSnapshot(year, { crimeaInUkraine }) {
  const tmp = path.join(OUT, `_tmp_ne_${year}.json`);
  execFileSync(mapshaper, ['-i', neFile, '-simplify', 'visvalingam', 'weighted', '10%', 'keep-shapes',
    '-o', tmp, 'precision=0.01', 'format=geojson'], { stdio: 'pipe' });
  const gj = await readJSON(tmp);
  await fs.rm(tmp);
  const features = gj.features.filter((f) => f.geometry).map((f) => {
    const p = f.properties;
    const code = p.ADM0_A3 in NE_CODES ? NE_CODES[p.ADM0_A3] : p.ADM0_A3;
    // Ruling power only for dependencies, not for disputed or indeterminate areas.
    const dependent = (p.TYPE === 'Dependency' || p.TYPE === 'Country') && p.SOVEREIGNT !== p.ADMIN;
    return {
      type: 'Feature',
      properties: { NAME: p.NAME_LONG || p.NAME, ENTITY: code, RULER: dependent ? p.SOVEREIGNT : null, PARTOF: null },
      geometry: f.geometry,
    };
  });
  if (crimeaInUkraine) {
    const rus = features.find((f) => f.properties.ENTITY === 'RUS');
    const ukr = features.find((f) => f.properties.ENTITY === 'UKR');
    const polys = rus.geometry.coordinates;
    const i = polys.findIndex((poly) => inRing(SIMFEROPOL, poly[0]));
    if (i === -1) throw new Error('Crimea polygon not found in Natural Earth Russia');
    const [crimea] = polys.splice(i, 1);
    ukr.geometry = ukr.geometry.type === 'Polygon'
      ? { type: 'MultiPolygon', coordinates: [ukr.geometry.coordinates, crimea] }
      : { ...ukr.geometry, coordinates: [...ukr.geometry.coordinates, crimea] };
  }
  for (const f of features) f.geometry = rewind(f.geometry);
  await writeJSON(path.join(OUT, `world_${year}.json`), { type: 'FeatureCollection', features });
  snapshots.push(year);
  console.log(`  ${year}: ${features.length} territories from Natural Earth${crimeaInUkraine ? ' (Crimea in Ukraine)' : ''}`);
}
await naturalEarthSnapshot(2014, { crimeaInUkraine: false });

await buildCShapes();
await buildLand();
await addRegions();

await writeJSON(path.join(OUT, 'index.json'), {
  source: 'historical-basemaps by A. Ourednik (GPL-3.0) to 1885; ICOW Colonial History 1.1 (Hensel) for colonial rulers; CShapes 2.0 (Schvitz, Girardin, Rüegger, Weidmann, Cederman and Gleditsch, CC BY-NC-SA 4.0) 1886 to 2013; Natural Earth (public domain) from 2014 and for land',
  snapshots,
  yearly: { from: CSHAPES_FROM, to: CSHAPES_TO, file: 'cshapes.json' },
  land: 'land.json',
}, true);
await writeJSON(path.join(CACHE_DIR, 'unmatched-border-names.json'), Object.fromEntries([...unmatched].sort()), true);
console.log(`${unmatched.size} names without a data entity (see scripts/.cache/unmatched-border-names.json)`);

// ---------- 1886 to 2013: CShapes 2.0 ----------
// Every CShapes unit (a state or colony with fixed borders between two dates)
// is shown in the years whose 1 July falls inside its dates. A unit is split
// into year ranges wherever its data entity, ruler or name changes (the
// Russian Empire becoming the Soviet Union, say); the copies share their
// arcs in the TopoJSON file, so the split costs almost nothing.
async function buildCShapes() {
  const raw = await cachedDownload('https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson', 'cshapes2.geojson');
  const gw = await cachedDownload('http://ksgleditsch.com/data/iisystem.dat', 'gw_iisystem.dat');

  // Gleditsch-Ward list of independent states: a unit whose code is in the
  // list on a date is sovereign then; otherwise it is a dependency.
  const spells = new Map();
  for (const line of (await fs.readFile(gw, 'latin1')).split(/\r?\n/)) {
    const [code, , , from, to] = line.split('\t');
    if (!to) continue;
    const d = (s) => { const [dd, mm, yy] = s.split(':').map(Number); return yy * 10000 + mm * 100 + dd; };
    const end = to.startsWith('31:12:2017') ? 99999999 : d(to); // the list ends in 2017
    (spells.get(Number(code)) ?? spells.set(Number(code), []).get(Number(code))).push([d(from), end]);
  }
  const sovereign = (code, year) => (spells.get(code) ?? []).some(([a, b]) => a <= year * 10000 + 701 && year * 10000 + 701 <= b);

  // Units whose data entity depends on the year or is not their name.
  const byYear = (...rules) => (y) => rules.find(([until]) => y <= until)[1];
  const CODES = {
    3: 'PART:USA', 4: 'PART:USA', 21: 'PART:CAN', 255: 'DEU',
    260: byYear([1990, 'BRD'], [9999, 'DEU']), 265: 'DDR', 300: 'AUH', 315: 'CSK',
    345: byYear([1991, 'YUG'], [9999, 'SRB']),
    365: byYear([1916, 'RUS_EMP'], [1921, 'RUS'], [1991, 'SUN'], [9999, 'RUS']),
    640: byYear([1922, 'OTT'], [9999, 'TUR']),
    710: byYear([1911, 'QING'], [1948, 'CHN_ROC'], [9999, 'CHN']),
    711: 'TIBET', 730: 'KOREA_HIST', 750: byYear([1946, 'RAJ'], [9999, 'IND']),
    815: 'VNM', 816: byYear([1975, 'DRV'], [9999, 'VNM']), 817: 'RVN',
    678: byYear([1989, 'YAR'], [9999, 'YEM']), 680: 'YPR', 681: 'PART:YEM', 6801: 'PART:YEM', 6812: 'PART:YEM',
    430: 'FR_WEST_AFRICA', 550: 'RHODESIA', 552: byYear([1964, 'RHODESIA'], [9999, 'ZWE']),
    561: 'SA_STATES', 562: 'SA_STATES', 563: 'SA_STATES', 564: 'SA_STATES', 5612: 'PART:ZAF',
    901: 'AUS_COLONIES', 902: 'AUS_COLONIES', 903: 'AUS_COLONIES', 904: 'AUS_COLONIES', 905: 'AUS_COLONIES', 906: 'AUS_COLONIES',
    3461: 'PART:BIH', 3462: 'PART:BIH', 4781: 'PART:NGA', 4782: 'PART:NGA', 4783: 'PART:NGA', 4784: 'PART:NGA',
    521: 'PART:SOM', 5200: 'PART:SOM', 5518: 'PART:ZMB', 5519: 'PART:ZMB', 602: 'PART:MAR', 6021: 'PART:MAR',
    609: 'ESH', 610: 'ESH', 6511: 'PSE', 6631: 'PSE', 665: null, 7020: 'CENTRAL_ASIA', 7030: 'CENTRAL_ASIA',
    7351: 'PART:RUS', 7506: null, 7708: null, 821: 'PART:MYS', 822: 'PART:MYS', 823: 'PART:MYS', 824: 'PART:MYS',
    827: 'PART:MYS', 8201: 'PART:MYS', 8202: 'PART:MYS', 8203: 'PART:MYS', 911: 'PART:PNG', 912: 'PART:PNG',
    9401: 'PART:PNG', 851: 'PART:IDN', 462: 'PART:GHA', 472: 'PART:CMR', 460: 'TGO', 470: 'CMR', 511: 'ZAN',
    490: 'COD', 484: 'COG', 731: 'PRK', 732: 'KOR', 930: 'NCL', 713: null,
    515: null, 291: null, 1201: null, 120: null, 65: null, 66: null, 585: null,
  };
  const NAMES = { 'Germany (Prussia)': 'Germany', 'German Federal Republic': 'Germany', 'Italy/Sardinia': 'Italy', Rumania: 'Romania', Surinam: 'Suriname', 'French Guyana': 'French Guiana' };
  const clean = (n) => NAMES[n] ?? n.replace(/\s*\([^)]*\)/g, '').trim();
  const entityName = (code) => countries[code]?.name ?? entities.historical[code]?.name;

  // Colonial rulers: the ICOW Colonial History dataset (Hensel 2018) gives
  // each country's colonial ruler before independence. Units it does not
  // cover, and colonies that changed hands, are listed in RULERS.
  const icowZip = await cachedDownload('https://www.paulhensel.org/Data/colhist.zip', 'icow_colhist.zip');
  const icowDir = path.join(CACHE_DIR, 'icow');
  execFileSync('unzip', ['-o', '-q', icowZip, '-d', icowDir]);
  const icow = new Map();
  for (const line of (await fs.readFile(path.join(icowDir, 'ICOW Colonial History 1.1', 'coldata110.csv'), 'utf8')).split(/\r?\n/).slice(1)) {
    const [state, , ruler] = line.split(',');
    if (Number(ruler) > 0) icow.set(Number(state), Number(ruler));
  }
  const RULER_NAMES = {
    2: 'United States', 200: 'United Kingdom', 210: 'Netherlands', 211: 'Belgium', 220: 'France', 230: 'Spain', 235: 'Portugal',
    255: 'Germany', 300: 'Austria-Hungary', 325: 'Italy', 365: 'Russia', 390: 'Denmark', 380: 'Sweden', 640: 'Ottoman Empire',
    651: 'Egypt', 663: 'Jordan', 530: 'Ethiopia', 560: 'South Africa', 710: 'China', 740: 'Japan', 750: 'India', 900: 'Australia',
    920: 'New Zealand', 20: 'Canada', 345: 'Yugoslavia', 520: 'Somalia', 850: 'Indonesia', 600: 'Morocco', 625: 'Sudan',
  };
  const R = (...rules) => (y) => rules.find(([until]) => y <= until)[1];
  const RULERS = {
    3: 'United States', 4: 'United States', 6: R([1898, 'Spain'], [9999, 'United States']), 40: R([1898, 'Spain'], [9999, 'United States']),
    21: 'United Kingdom', 65: 'France', 66: 'France', 120: 'France', 585: 'France', 930: 'France', 960: 'France', 1201: 'France',
    3461: 'Austria-Hungary', 3462: 'Austria-Hungary', 460: 'Germany', 461: 'France', 462: 'United Kingdom', 470: 'Germany', 471: 'France', 472: 'United Kingdom',
    510: R([1916, 'Germany'], [9999, 'United Kingdom']), 565: R([1915, 'Germany'], [9999, 'South Africa']), 515: 'Belgium',
    840: R([1898, 'Spain'], [9999, 'United States']), 713: R([1945, 'Japan'], [9999, 'China']), 730: 'Japan',
    912: R([1914, 'Germany'], [9999, 'Australia']), 911: R([1905, 'United Kingdom'], [9999, 'Australia']), 9401: 'Germany',
    531: R([1941, 'Italy'], [1951, 'United Kingdom'], [9999, 'Ethiopia']), 5200: 'Italy',
    4781: 'United Kingdom', 4782: 'United Kingdom', 4783: 'United Kingdom', 4784: 'United Kingdom', 521: 'United Kingdom',
    5518: 'United Kingdom', 5519: 'United Kingdom', 5612: 'United Kingdom', 561: 'United Kingdom', 562: 'United Kingdom',
    563: R([1899, null], [9999, 'United Kingdom']), 564: R([1899, null], [9999, 'United Kingdom']),
    901: 'United Kingdom', 902: 'United Kingdom', 903: 'United Kingdom', 904: 'United Kingdom', 905: 'United Kingdom', 906: 'United Kingdom',
    821: 'United Kingdom', 822: 'United Kingdom', 823: 'United Kingdom', 824: 'United Kingdom', 827: 'United Kingdom',
    8201: 'United Kingdom', 8202: 'United Kingdom', 8203: 'United Kingdom', 681: 'United Kingdom', 6801: 'United Kingdom', 6812: 'United Kingdom',
    665: 'United Kingdom', 602: 'Spain', 6021: 'Spain', 609: 'Spain', 610: 'Spain', 7351: 'Japan', 6511: 'Egypt', 6631: 'Jordan',
    260: 'Allied occupation', 265: 'Soviet occupation', 340: 'Austria-Hungary', 395: 'Denmark', 815: 'France',
    651: R([1913, 'Ottoman Empire'], [9999, 'United Kingdom']),
    7020: 'Russia', 7030: 'Russia', 851: 'Netherlands', 7506: null, 7708: null, 291: null, 430: 'France', 550: 'United Kingdom',
  };
  const rulerFor = (gwcode, y) => {
    const rule = RULERS[gwcode];
    if (rule !== undefined) return typeof rule === 'function' ? rule(y) : rule;
    const c = icow.get(gwcode);
    return c ? RULER_NAMES[c] ?? null : null;
  };
  const noRuler = new Set();
  // Names colonies had before independence, where they differ.
  const DEP_NAMES = {
    452: 'Gold Coast', 490: R([1907, 'Congo Free State'], [9999, 'Belgian Congo']), 552: 'Southern Rhodesia', 551: 'Northern Rhodesia',
    553: 'Nyasaland', 570: 'Basutoland', 571: 'Bechuanaland', 775: 'Burma', 780: 'Ceylon', 850: 'Dutch East Indies',
    110: 'British Guiana', 115: 'Dutch Guiana', 80: 'British Honduras', 565: R([1915, 'German South West Africa'], [9999, 'South West Africa']),
    510: R([1916, 'German East Africa'], [9999, 'Tanganyika']), 438: 'French Guinea', 437: 'Ivory Coast', 434: 'Dahomey',
    439: 'Upper Volta', 432: 'French Sudan', 482: 'Ubangi-Shari', 625: 'Anglo-Egyptian Sudan', 501: R([1919, 'British East Africa'], [9999, 'Kenya Colony']),
    572: 'Swaziland', 420: 'Gambia', 451: 'Sierra Leone', 540: 'Portuguese West Africa (Angola)', 541: 'Portuguese East Africa (Mozambique)',
  };

  // historical-basemaps maps, for period names of colonies ("Gold Coast"
  // rather than "Ghana" in 1900).
  const hbYears = [1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010];
  const hb = new Map();
  for (const y of hbYears) {
    hb.set(y, (await readJSON(path.join(src, 'geojson', `world_${y}.geojson`))).features.filter((f) => f.geometry).map((f) => ({ ...f, geometry: rewind(f.geometry) })));
  }
  const { geoContains } = await import('d3-geo');
  const hbAt = (year, point) => {
    const y = hbYears.filter((h) => h <= year).pop();
    return hb.get(y).find((f) => geoContains(f, point));
  };

  const gj = await readJSON(raw);
  const out = [];
  const unmatched = new Set();
  for (const f of gj.features) {
    const p = f.properties;
    const from = Math.max(CSHAPES_FROM, p.gwsmonth * 100 + p.gwsday <= 701 ? p.gwsyear : p.gwsyear + 1);
    const to = Math.min(CSHAPES_TO, p.gwemonth * 100 + p.gweday >= 701 ? p.gweyear : p.gweyear - 1);
    if (from > to) continue;
    const cap = [p.caplong, p.caplat];
    let run = null;
    for (let y = from; y <= to; y++) {
      const rule = CODES[p.gwcode];
      let code = rule === undefined ? resolveDataset(clean(p.cntry_name), y) : typeof rule === 'function' ? rule(y) : rule;
      if (code && !code.startsWith('PART:') && !countries[code] && !entities.historical[code]) code = null;
      if (code === null && rule === undefined) unmatched.add(p.cntry_name);
      const here = hbAt(y, cap);
      const hbName = here?.properties.NAME?.trim();
      let ruler = null;
      if (!sovereign(p.gwcode, y)) {
        ruler = rulerFor(p.gwcode, y);
        if (ruler === null && !(p.gwcode in RULERS)) noRuler.add(`${p.cntry_name} (${p.gwcode})`);
      }
      const dep = ruler && DEP_NAMES[p.gwcode];
      const name = dep ? (typeof dep === 'function' ? dep(y) : dep)
        : code && entities.historical[code] ? entityName(code)
        : hbName && code && resolve(hbName, y) === code ? hbName : clean(p.cntry_name);
      const key = `${code}|${ruler}|${name}`;
      if (run && run.key === key) run.Y1 = y;
      else {
        run = { key, Y0: y, Y1: y, NAME: name, ENTITY: code, RULER: ruler };
        out.push({ type: 'Feature', properties: run, geometry: f.geometry });
      }
    }
  }
  for (const o of out) delete o.properties.key;
  const tmpIn = path.join(OUT, '_cshapes_in.json');
  await writeJSON(tmpIn, { type: 'FeatureCollection', features: out });
  const tmpOut = path.join(OUT, '_cshapes_out.json');
  execFileSync(mapshaper, ['-i', tmpIn, 'snap', '-simplify', 'visvalingam', 'weighted', '8%', 'keep-shapes',
    '-o', tmpOut, 'format=topojson', 'quantization=100000'], { stdio: 'pipe', maxBuffer: 1 << 30 });
  await fs.rm(tmpIn);
  // TopoJSON rings follow the same winding rules after decoding; rewind in the app is not needed
  // because mapshaper writes clockwise outer rings, matching d3 / three-globe.
  await fs.rename(tmpOut, path.join(OUT, 'cshapes.json'));
  const size = (await fs.stat(path.join(OUT, 'cshapes.json'))).size;
  console.log(`  ${CSHAPES_FROM} to ${CSHAPES_TO}: ${out.length} dated shapes from CShapes 2.0 (${(size / 1e6).toFixed(1)} MB)`);
  if (unmatched.size) console.log(`  CShapes names without a data entity: ${[...unmatched].join(', ')}`);
  if (noRuler.size) console.log(`  dependencies without a known ruler: ${[...noRuler].join(', ')}`);
}

// ---------- Land under every map ----------
async function buildLand() {
  const file = await cachedDownload('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson', 'ne_50m_land.geojson');
  const tmp = path.join(OUT, '_land.json');
  execFileSync(mapshaper, ['-i', file, '-filter', 'this.area > 2e9', '-simplify', 'visvalingam', 'weighted', '8%', 'keep-shapes',
    '-o', tmp, 'precision=0.01', 'format=geojson'], { stdio: 'pipe' });
  const gj = await readJSON(tmp);
  await fs.rm(tmp);
  // Antarctica's ring runs around the pole and cannot be filled as a cap; leave it out.
  const features = gj.features.filter((f) => f.geometry && !f.geometry.coordinates.flat(3).every((v, i) => i % 2 === 0 || v < -60))
    .map((f) => ({ type: 'Feature', properties: { LAND: true }, geometry: rewind(f.geometry) }));
  await writeJSON(path.join(OUT, 'land.json'), { type: 'FeatureCollection', features });
  console.log(`  land: ${features.length} shapes`);
}

// ---------- Regions for unmatched territories ----------
// Territories on the old maps that match no data entity (local polities,
// parts of later states) get the World Bank region of the present-day
// country at their center, so the map can show that region's typical range.
async function addRegions() {
  const { geoCentroid, geoContains } = await import('d3-geo');
  const now = (await readJSON(path.join(OUT, 'world_2014.json'))).features;
  const regionAt = (pt) => {
    const f = now.find((g) => geoContains(g, pt));
    return f ? countries[f.properties.ENTITY]?.region ?? null : null;
  };
  let tagged = 0;
  for (const year of snapshots.filter((y) => y < CSHAPES_FROM)) {
    const file = path.join(OUT, `world_${year}.json`);
    const gj = await readJSON(file);
    for (const f of gj.features) {
      const e = f.properties.ENTITY;
      if (e && !e.startsWith('PART:')) continue;
      const first = f.geometry.coordinates.flat(f.geometry.type === 'Polygon' ? 1 : 2)[0];
      const region = e ? countries[e.slice(5)]?.region : regionAt(geoCentroid(f)) ?? (first ? regionAt(first) : null);
      if (region) {
        f.properties.REGION = region;
        tagged++;
      }
    }
    await writeJSON(file, gj);
  }
  console.log(`  regions added to ${tagged} unmatched territories`);
}

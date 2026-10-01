// Builds simplified border snapshots for the app from the historical-basemaps
// project (https://github.com/aourednik/historical-basemaps), whose newest
// map is 2010, plus current borders from Natural Earth admin-0 countries
// (https://www.naturalearthdata.com, public domain):
//  - 2011 (South Sudan's independence): Natural Earth with Crimea in Ukraine
//  - 2014 onward: Natural Earth as published, which draws borders by de facto
//    control (Crimea under Russia). This matches the data sources: World
//    Bank figures for Ukraine exclude Crimea from 2014.
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
  .filter(({ m }) => m && Number(m[1]) >= FIRST_YEAR)
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

const { resolve } = await loadResolver();
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
await naturalEarthSnapshot(2011, { crimeaInUkraine: true });
await naturalEarthSnapshot(2014, { crimeaInUkraine: false });

await writeJSON(path.join(OUT, 'index.json'), {
  source: 'historical-basemaps by A. Ourednik (GPL-3.0), to 2010; Natural Earth admin-0 countries (public domain) from 2011',
  snapshots,
}, true);
await writeJSON(path.join(CACHE_DIR, 'unmatched-border-names.json'), Object.fromEntries([...unmatched].sort()), true);
console.log(`${unmatched.size} names without a data entity (see scripts/.cache/unmatched-border-names.json)`);

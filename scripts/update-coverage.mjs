// Reads every metric file and
//  1. writes firstYear / lastYear into public/config/metrics.json from the
//     data actually present (never assumed), and
//  2. writes public/data/timeline.json with the slider stops: every border
//     snapshot year plus every year in which at least DENSE_MIN territories
//     have some value. Sparse early periods therefore snap between the years
//     that really have data; dense periods move year by year.
import path from 'node:path';
import { CONFIG_DIR, DATA_DIR, METRICS_DIR, readJSON, writeJSON, loadRegistry } from './lib/util.mjs';

const DENSE_MIN = 20;
const registry = await loadRegistry();
const eras = await readJSON(path.join(CONFIG_DIR, 'eras.json'));
const borders = await readJSON(path.join(DATA_DIR, 'borders/index.json'));
const minYear = eras.minYear ?? 1600;

const perYear = new Map(); // year -> Set(entity)
const coverage = {};
for (const m of registry.metrics) {
  if (m.loader?.type === 'borders') {
    m.firstYear = borders.snapshots.find((y) => y >= minYear);
    delete m.lastYear;
    continue;
  }
  let series;
  try {
    series = await readJSON(path.join(METRICS_DIR, `${m.id}.json`));
  } catch {
    console.warn(`  ! no data file for ${m.id}`);
    continue;
  }
  let first = Infinity;
  let last = -Infinity;
  const entities = Object.keys(series).length;
  // Labels and event lists do not count toward data density.
  const numeric = m.format !== 'label' && m.format !== 'events';
  for (const [code, years] of Object.entries(series)) {
    for (const y of Object.keys(years).map(Number)) {
      if (y < minYear) continue;
      first = Math.min(first, y);
      last = Math.max(last, y);
      if (!numeric) continue;
      if (!perYear.has(y)) perYear.set(y, new Set());
      perYear.get(y).add(code);
    }
  }
  m.firstYear = first;
  m.lastYear = last;
  coverage[m.id] = { firstYear: first, lastYear: last, entities };
  console.log(`  ${m.id.padEnd(26)} ${first}-${last}  ${entities} entities`);
}
await writeJSON(path.join(CONFIG_DIR, 'metrics.json'), registry, true);

const dense = [...perYear].filter(([, s]) => s.size >= DENSE_MIN).map(([y]) => y);
const maxYear = Math.max(...dense);
const stops = [...new Set([...dense, ...borders.snapshots.filter((y) => y >= minYear)])]
  .filter((y) => y >= minYear && y <= maxYear)
  .sort((a, b) => a - b);
await writeJSON(path.join(DATA_DIR, 'timeline.json'), { minYear, maxYear, stops, snapshots: borders.snapshots.filter((y) => y >= minYear) }, true);
console.log(`Timeline: ${stops.length} stops from ${stops[0]} to ${maxYear}`);
console.log(`  first stops: ${stops.slice(0, 30).join(', ')}`);

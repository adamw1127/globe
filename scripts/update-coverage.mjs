// Reads every metric file and
//  1. writes firstYear / lastYear into public/config/metrics.json from the
//     data actually present (never assumed), and
//  2. writes public/data/timeline.json with the slider stops: every border
//     snapshot year plus every year in which at least DENSE_MIN territories
//     have some value (numbers, labels or events such as wars). Sparse early periods therefore snap between the years
//     that really have data; dense periods move year by year.
import path from 'node:path';
import fs from 'node:fs/promises';
import { CONFIG_DIR, DATA_DIR, METRICS_DIR, readJSON, writeJSON, loadRegistry } from './lib/util.mjs';
import { valueAt } from './lib/timeline.mjs';

const DENSE_MIN = 10;
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
  for (const [code, years] of Object.entries(series)) {
    for (const y of Object.keys(years).map(Number)) {
      if (y < minYear) continue;
      first = Math.min(first, y);
      last = Math.max(last, y);
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
// Slider stops: benchmark years before `annualFrom`, then every year that
// has data for at least DENSE_MIN territories.
const benchmarks = (eras.benchmarks ?? []).filter((y) => y >= minYear && y < (eras.annualFrom ?? Infinity));
const annual = dense.filter((y) => y >= (eras.annualFrom ?? minYear) && y <= maxYear);
const stops = [...new Set([...benchmarks, ...annual])].sort((a, b) => a - b);

// For each map-colorable metric, the first stop at which at least one
// territory on that stop's map has a value: the slider cannot go earlier
// while that metric colors the map (the map would be blank).
const snapshots = borders.snapshots.filter((y) => y >= minYear);
const snapshotFor = (y) => snapshots.filter((s) => s <= y).pop() ?? snapshots[0];
const snapshotCodes = new Map();
for (const s of snapshots) {
  const gj = await readJSON(path.join(DATA_DIR, `borders/world_${s}.json`));
  snapshotCodes.set(s, [...new Set(gj.features.map((f) => f.properties.ENTITY).filter((c) => c && !c.startsWith('PART:')))]);
}
const colorableFrom = {};
const blankStops = {};
for (const m of registry.metrics) {
  if (m.format === 'label' || m.format === 'events' || m.loader?.type === 'borders') continue;
  let series;
  try {
    series = await readJSON(path.join(METRICS_DIR, `${m.id}.json`));
  } catch {
    continue;
  }
  const blank = [];
  for (const stop of stops) {
    const colored = snapshotCodes.get(snapshotFor(stop)).some((c) => valueAt(series[c], stop, eras, { carry: m.carryForward !== false }));
    if (colored) colorableFrom[m.id] ??= stop;
    else if (colorableFrom[m.id] !== undefined) blank.push(stop);
  }
  if (blank.length) blankStops[m.id] = blank;
}
await writeJSON(path.join(DATA_DIR, 'timeline.json'), { minYear, maxYear, stops, snapshots, colorableFrom, blankStops }, true);
console.log(`Timeline: ${stops.length} stops (${benchmarks.join(', ')} then yearly from ${eras.annualFrom}) to ${maxYear}`);

// One file per data entity with every metric's series, so the side panel
// loads ~30 KB for a territory instead of every metric file.
const bundles = {};
for (const m of registry.metrics) {
  if (m.loader?.type === 'borders') continue;
  let series;
  try {
    series = await readJSON(path.join(METRICS_DIR, `${m.id}.json`));
  } catch {
    continue;
  }
  for (const [code, years] of Object.entries(series)) (bundles[code] ??= {})[m.id] = years;
}
const entityDir = path.join(DATA_DIR, 'entity');
await fs.rm(entityDir, { recursive: true, force: true });
for (const [code, data] of Object.entries(bundles)) await writeJSON(path.join(entityDir, `${code}.json`), data);
console.log(`Entity bundles: ${Object.keys(bundles).length}`);

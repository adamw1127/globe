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
import { feature } from 'topojson-client';
import { valueAt, valueInWindow, windowFor } from './lib/timeline.mjs';
import { mapYearFor, isYearlyMap, featuresInYear } from './lib/border-years.mjs';
import { quantile } from './lib/estimates.mjs';
import { round } from './lib/util.mjs';

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
const yearlyTopo = borders.yearly ? await readJSON(path.join(DATA_DIR, 'borders', borders.yearly.file)) : null;
const yearlyFeatures = yearlyTopo ? feature(yearlyTopo, yearlyTopo.objects[Object.keys(yearlyTopo.objects)[0]]).features : [];
const mapCodes = new Map();
const codesOf = (features) => [...new Set(features.map((f) => f.properties.ENTITY).filter((c) => c && !c.startsWith('PART:')))];
async function codesForStop(stop) {
  const key = mapYearFor(borders, stop);
  if (!mapCodes.has(key)) {
    mapCodes.set(key, isYearlyMap(borders, key)
      ? codesOf(featuresInYear(yearlyFeatures, key))
      : codesOf((await readJSON(path.join(DATA_DIR, `borders/world_${key}.json`))).features));
  }
  return mapCodes.get(key);
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
    const colored = (await codesForStop(stop)).some((c) => valueAt(series[c], stop, eras, { carry: m.carryForward !== false }));
    if (colored) colorableFrom[m.id] ??= stop;
    else if (colorableFrom[m.id] !== undefined) blank.push(stop);
  }
  if (blank.length) blankStops[m.id] = blank;
}
await writeJSON(path.join(DATA_DIR, 'timeline.json'), { minYear, maxYear, stops, snapshots, colorableFrom, blankStops }, true);
console.log(`Timeline: ${stops.length} stops (${benchmarks.join(', ')} then yearly from ${eras.annualFrom}) to ${maxYear}`);

// Per-metric statistics (data/stats/<id>.json) from present-day countries'
// real values only:
//  - years: for each slider stop, [n, p20, p50, p80] worldwide (W) and per
//    World Bank region, for peer-range estimates
//  - breaks: color-class boundaries pooled over all stops, so a color means
//    the same value in every year
// and, in the entity bundles, each value's percentile among countries that
// year ($pct: { metric: { year: percentile } }); the number of countries
// ranked each year is in the stats file (n: { year: count }).
const countries = await readJSON(path.join(DATA_DIR, 'countries.json'));
const modern = Object.keys(countries);
const statsDir = path.join(DATA_DIR, 'stats');
await fs.rm(statsDir, { recursive: true, force: true });
const pct = {};
const CLASSES = 7;
for (const m of registry.metrics) {
  if (!m.estimate) continue;
  let series;
  try {
    series = await readJSON(path.join(METRICS_DIR, `${m.id}.json`));
  } catch {
    continue;
  }
  const years = {};
  const pooled = [];
  for (const stop of stops) {
    const win = windowFor(stop, eras);
    const groups = { W: [] };
    for (const c of modern) {
      const hit = valueInWindow(series[c], win);
      if (!hit || typeof hit.value !== 'number') continue;
      groups.W.push(hit.value);
      const r = countries[c].region;
      if (r) (groups[r] ??= []).push(hit.value);
    }
    if (!groups.W.length) continue;
    pooled.push(...groups.W);
    years[stop] = {};
    for (const [g, vals] of Object.entries(groups)) {
      vals.sort((a, b) => a - b);
      years[stop][g] = [vals.length, round(quantile(vals, 0.2)), round(quantile(vals, 0.5)), round(quantile(vals, 0.8))];
    }
  }
  pooled.sort((a, b) => a - b);
  const breaks = [...new Set(Array.from({ length: CLASSES - 1 }, (_, i) => round(quantile(pooled, (i + 1) / CLASSES))))];
  // Percentiles for every year with at least 5 countries.
  const byYear = new Map();
  for (const c of modern) for (const [y, v] of Object.entries(series[c] ?? {})) if (typeof v === 'number') (byYear.get(y) ?? byYear.set(y, []).get(y)).push(v);
  const counts = {};
  for (const [y, vals] of byYear) {
    if (vals.length < 5) continue;
    counts[y] = vals.length;
    vals.sort((a, b) => a - b);
    for (const [code, ys] of Object.entries(series)) {
      const v = ys[y];
      if (typeof v !== 'number') continue;
      const isModern = Boolean(countries[code]);
      let below = 0;
      let equal = 0;
      for (const x of vals) {
        if (x < v) below++;
        else if (x === v) equal++;
      }
      if (!isModern) equal++;
      const n = vals.length + (isModern ? 0 : 1);
      ((pct[code] ??= {})[m.id] ??= {})[y] = Math.round((100 * (below + equal / 2)) / n);
    }
  }
  await writeJSON(path.join(statsDir, `${m.id}.json`), { breaks, min: pooled[0], max: pooled[pooled.length - 1], n: counts, years });
}
console.log(`Stats: ${(await fs.readdir(statsDir)).length} metrics`);

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
for (const [code, data] of Object.entries(bundles)) await writeJSON(path.join(entityDir, `${code}.json`), pct[code] ? { ...data, $pct: pct[code] } : data);
console.log(`Entity bundles: ${Object.keys(bundles).length}`);

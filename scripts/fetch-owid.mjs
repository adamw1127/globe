// Loads registry metrics backed by Our World in Data grapher CSVs.
//  - loader.type "owid": the metric's whole series comes from OWID.
//  - extend: [{ type: "owid", ... }]: fills years the primary source lacks
//    (for example pre-1960 population behind World Bank data). Run this
//    after fetch-worldbank.mjs.
import path from 'node:path';
import { DATA_DIR, METRICS_DIR, loadRegistry, readJSON, writeJSON, mergeMetricFile, sortSeries } from './lib/util.mjs';
import { loadOwidSeries } from './lib/owid.mjs';

const registry = await loadRegistry();
const countries = await readJSON(path.join(DATA_DIR, 'countries.json'));
const validCodes = new Set(Object.keys(countries));
const only = new Set(process.argv.slice(2));

for (const m of registry.metrics) {
  if (only.size && !only.has(m.id)) continue;
  if (m.loader?.type === 'owid') {
    const s = await loadOwidSeries(m.loader.slug, m.loader.column, { validCodes });
    await writeJSON(path.join(METRICS_DIR, `${m.id}.json`), sortSeries(s));
    console.log(`  ${m.id}: ${Object.keys(s).length} entities from OWID ${m.loader.slug}`);
  }
  for (const ext of m.extend ?? []) {
    if (ext.type !== 'owid') continue;
    const s = await loadOwidSeries(ext.slug, ext.column, { validCodes });
    if (ext.beforeYear) {
      for (const years of Object.values(s)) for (const y of Object.keys(years)) if (Number(y) >= ext.beforeYear) delete years[y];
    }
    await mergeMetricFile(m.id, s);
    console.log(`  ${m.id}: extended with OWID ${ext.slug}${ext.beforeYear ? ` (years before ${ext.beforeYear})` : ''}`);
  }
}

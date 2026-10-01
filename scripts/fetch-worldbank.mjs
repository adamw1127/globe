// Pulls every registry metric whose loader.type is "worldbank" from the
// World Bank API (no key needed) and writes public/data/metrics/<id>.json
// shaped { ISO3: { year: value } }. Regional aggregates are dropped.
//
//   node scripts/fetch-worldbank.mjs            all World Bank metrics
//   node scripts/fetch-worldbank.mjs gdp gini   only these ids
import path from 'node:path';
import { DATA_DIR, METRICS_DIR, loadRegistry, fetchWithRetry, writeJSON, round, sortSeries, pool } from './lib/util.mjs';

const API = 'https://api.worldbank.org/v2';
const END_YEAR = new Date().getFullYear();

async function fetchCountries() {
  const [, rows] = await fetchWithRetry(`${API}/country?format=json&per_page=400`);
  const countries = {};
  for (const c of rows) {
    if (c.region.id === 'NA') continue; // aggregates such as "World" or "Euro area"
    countries[c.id] = { name: c.name, iso2: c.iso2Code, region: c.region.value.trim(), income: c.incomeLevel.value };
  }
  return countries;
}

async function fetchIndicator(code, wbSource, countries) {
  const series = {};
  let page = 1;
  let pages = 1;
  do {
    const src = wbSource ? `&source=${wbSource}` : '';
    const url = `${API}/country/all/indicator/${code}?format=json&per_page=20000&date=1960:${END_YEAR}&page=${page}${src}`;
    const body = await fetchWithRetry(url);
    if (!Array.isArray(body) || !body[1]) {
      throw new Error(`No data for ${code}: ${JSON.stringify(body).slice(0, 200)}`);
    }
    pages = body[0].pages;
    for (const row of body[1]) {
      const iso3 = row.countryiso3code || row.country?.id;
      if (!countries[iso3] || row.value === null) continue;
      (series[iso3] ??= {})[row.date] = round(row.value);
    }
    page++;
  } while (page <= pages);
  return sortSeries(series);
}

const registry = await loadRegistry();
const only = new Set(process.argv.slice(2));
const metrics = registry.metrics.filter(
  (m) => m.loader?.type === 'worldbank' && (!only.size || only.has(m.id)),
);

console.log('Fetching World Bank country list...');
const countries = await fetchCountries();
await writeJSON(path.join(DATA_DIR, 'countries.json'), countries);
console.log(`  ${Object.keys(countries).length} economies`);

await pool(metrics, 4, async (m) => {
  try {
    const series = await fetchIndicator(m.loader.indicator, m.loader.wbSource, countries);
    const n = Object.values(series).reduce((a, s) => a + Object.keys(s).length, 0);
    await writeJSON(path.join(METRICS_DIR, `${m.id}.json`), series);
    console.log(`  ${m.id.padEnd(26)} ${m.loader.indicator.padEnd(22)} ${Object.keys(series).length} entities, ${n} values`);
  } catch (err) {
    console.error(`  FAILED ${m.id}: ${err.message}`);
    process.exitCode = 1;
  }
});

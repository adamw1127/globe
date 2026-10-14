// Maddison Project Database 2023 (Bolt & van Zanden): GDP per capita and
// GDP in 2011 international dollars, back to 1600 and earlier.
//
// Preferred input: the official workbook. Download mpd2023_web.xlsx from
// https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023
// into scripts/.cache/. The Dataverse host blocks scripted downloads, so when
// the workbook is missing this loader falls back to Our World in Data's
// republication of the same 2023 release.
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { CACHE_DIR, DATA_DIR, METRICS_DIR, readJSON, writeJSON, round, sortSeries } from './lib/util.mjs';
import { loadOwidSeries } from './lib/owid.mjs';

const FIRST_YEAR = 1600;
const MADDISON_CODES = { SUN: 'SUN', YUG: 'YUG', CSK: 'CSK' };
const countries = await readJSON(path.join(DATA_DIR, 'countries.json'));
const validCodes = new Set(Object.keys(countries));

const workbook = path.join(CACHE_DIR, 'mpd2023_web.xlsx');
let gdppc = {};
let gdp = {};
try {
  await fs.access(workbook);
  console.log('Reading official Maddison workbook');
  const wb = XLSX.readFile(workbook);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Full data']);
  for (const r of rows) {
    const code = MADDISON_CODES[r.countrycode] ?? r.countrycode;
    if (r.year < FIRST_YEAR || (!validCodes.has(code) && !MADDISON_CODES[code])) continue;
    if (Number.isFinite(r.gdppc)) (gdppc[code] ??= {})[r.year] = round(r.gdppc);
    if (Number.isFinite(r.gdppc) && Number.isFinite(r.pop)) (gdp[code] ??= {})[r.year] = round(r.gdppc * r.pop * 1000);
  }
} catch {
  console.log('Official workbook not found, using the OWID mirror of Maddison 2023');
  gdppc = await loadOwidSeries('gdp-per-capita-maddison-project-database', 'gdp_per_capita', { validCodes, fromYear: FIRST_YEAR });
  gdp = await loadOwidSeries('gdp-maddison-project-database', 'gdp', { validCodes, fromYear: FIRST_YEAR });
}
await writeJSON(path.join(METRICS_DIR, 'maddison_gdppc.json'), sortSeries(gdppc));
await writeJSON(path.join(METRICS_DIR, 'maddison_gdp.json'), sortSeries(gdp));
console.log(`  maddison_gdppc: ${Object.keys(gdppc).length} entities, maddison_gdp: ${Object.keys(gdp).length} entities`);

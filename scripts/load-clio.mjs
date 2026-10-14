// Clio Infra long-run series (clio-infra.eu): fills years a metric's primary
// source lacks, for example inflation before 1960, which Clio Infra compiles
// from historical price records (largely Reinhart and Rogoff's) back to 1500.
//
//   extend: [{ "type": "clio", "file": "Inflation", "beforeYear": 1960 }]
//
// `beforeYear` (optional) keeps only earlier years. Existing values always win.
// Run after the primary loaders.
import XLSX from 'xlsx';
import { loadRegistry, cachedDownload, mergeMetricFile, round } from './lib/util.mjs';
import { loadResolver } from './lib/entities.mjs';

// Clio Infra names the resolver does not know.
const NAMES = {
  'Congo, DRC': 'COD', Congo: 'COG', 'Solomon Is.': 'SLB', Swaziland: 'SWZ', 'The Gambia': 'GMB', 'Timor Leste': 'TLS',
  Macedonia: 'MKD', 'South Korea': 'KOR', 'North Korea': 'PRK', 'Cape Verde': 'CPV', Laos: 'LAO', Syria: 'SYR', Russia: 'RUS',
  Iran: 'IRN', Egypt: 'EGY', Venezuela: 'VEN', Yemen: 'YEM', Vietnam: 'VNM', 'Kyrgyzstan': 'KGZ', 'Slovakia': 'SVK',
  'Czech Republic': 'CZE', 'St. Kitts and Nevis': 'KNA', 'St. Lucia': 'LCA', 'St. Vincent and the Grenadines': 'VCT',
  "Cote d'Ivoire": 'CIV', Turkey: 'TUR', Brunei: 'BRN', Bahamas: 'BHS', Micronesia: 'FSM',
};

const registry = await loadRegistry();
const { resolveDataset, countries } = await loadResolver();
const unmatched = new Set();

for (const m of registry.metrics) {
  for (const ext of m.extend ?? []) {
    if (ext.type !== 'clio') continue;
    const file = await cachedDownload(`https://clio-infra.eu/data/${ext.file}_Compact.xlsx`, `clio_${ext.file}_Compact.xlsx`);
    const wb = XLSX.readFile(file);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const header = rows[0].map(String);
    const series = {};
    let filled = 0;
    for (const row of rows.slice(1)) {
      const name = row[1];
      if (!name) continue;
      const code = NAMES[name] ?? resolveDataset(name);
      if (!code || !countries[code]) {
        unmatched.add(name);
        continue;
      }
      header.forEach((h, i) => {
        if (!/^\d{4}$/.test(h)) return;
        const y = Number(h);
        if (ext.beforeYear && y >= ext.beforeYear) return;
        const v = row[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) return;
        (series[code] ??= {})[y] = round(v);
        filled++;
      });
    }
    await mergeMetricFile(m.id, series);
    console.log(`  ${m.id}: Clio Infra ${ext.file}, ${Object.keys(series).length} countries, ${filled} values offered`);
  }
}
if (unmatched.size) console.log(`  unmatched names (skipped): ${[...unmatched].sort().join(', ')}`);

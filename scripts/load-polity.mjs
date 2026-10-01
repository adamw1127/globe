// Polity5 (Center for Systemic Peace), 1800-2018: polity2 score and a
// derived regime type label.
// Source: https://www.systemicpeace.org/inscrdata.html (p5v2018.xls)
import path from 'node:path';
import XLSX from 'xlsx';
import { METRICS_DIR, cachedDownload, writeJSON, sortSeries } from './lib/util.mjs';
import { loadResolver } from './lib/entities.mjs';

const URL = 'https://www.systemicpeace.org/inscr/p5v2018.xls';

// Polity state codes that need an explicit mapping (historical units or
// codes whose meaning changed over time). Others resolve by country name.
function codeFor(row, resolve) {
  const { scode, country, year } = row;
  const fixed = {
    USR: 'SUN', YUG: 'YUG', YGS: year <= 2002 ? 'YUG' : 'SRB', CZE: 'CSK', CZR: 'CZE', GFR: 'BRD', GDR: 'DDR',
    KOR: 'KOREA_HIST', ROK: 'KOR', PRK: 'PRK', PKS: 'PAK', ETI: 'ETH', SDN: 'SDN', SUD: 'SDN', SSU: 'SSD',
    DRV: 'DRV', RVN: 'RVN', YAR: 'YAR', YPR: 'YPR', BAV: 'BAV', SAX: 'SAX', BAD: 'BAD', WRT: 'WUR', MOD: 'MOD',
    PAP: 'PAP', PMA: 'PMA', SAR: 'SAR', SIC: 'SIC', TUS: 'TUS', TAW: 'TWN', KOS: 'XKX', MNT: 'MNE', ETM: 'TLS',
    CON: 'COG', UAE: 'ARE', ZAI: 'COD', IVO: 'CIV', MYA: 'MMR', SWA: 'SWZ', BOS: 'BIH', MAC: 'MKD', UKG: 'GBR', GMY: country === 'Prussia' ? 'PRUSSIA' : 'DEU',
    AUS: year < 1867 ? 'HAB' : year <= 1918 ? 'AUH' : 'AUT',
  };
  if (scode in fixed) return fixed[scode];
  return resolve(country, year);
}

function regimeLabel(p) {
  if (p === -66) return 'Foreign interruption';
  if (p === -77) return 'Interregnum (collapse of central authority)';
  if (p === -88) return 'Transition';
  if (p >= 6) return 'Democracy';
  if (p <= -6) return 'Autocracy';
  return 'Anocracy (mixed regime)';
}

const file = await cachedDownload(URL, 'polity5.xls');
const rows = XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets.p5v2018);
const { resolve } = await loadResolver();
const polity2 = {};
const regime = {};
const missing = new Set();
for (const r of rows) {
  const code = codeFor(r, resolve);
  if (!code) { missing.add(`${r.scode} ${r.country}`); continue; }
  if (Number.isFinite(r.polity2)) (polity2[code] ??= {})[r.year] = r.polity2;
  if (Number.isFinite(r.polity)) (regime[code] ??= {})[r.year] = regimeLabel(r.polity);
}
await writeJSON(path.join(METRICS_DIR, 'polity2.json'), sortSeries(polity2));
await writeJSON(path.join(METRICS_DIR, 'regime_type.json'), sortSeries(regime));
console.log(`  polity2: ${Object.keys(polity2).length} entities; unmapped: ${[...missing].join(', ') || 'none'}`);

// RICardo (Sciences Po medialab): bilateral trade 1800-1938.
// https://github.com/medialab/ricardo_data
//  - Federico-Tena world trade totals (current US$, goods only) extend the
//    exports_usd / imports_usd metrics back to 1800.
//  - Bilateral flows give each territory's top 5 partners per year, written
//    into public/data/trade/<CODE>/<year>.json.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { CACHE_DIR, mergeMetricFile, round } from './lib/util.mjs';
import { parseCSVLine, parseCSV } from './lib/owid.mjs';
import { loadResolver } from './lib/entities.mjs';
import { patchTradeFile, clearTradeContent, rebuildTradeIndex } from './lib/trade.mjs';

const REPO = path.join(CACHE_DIR, 'ricardo');
try {
  await fsp.access(REPO);
} catch {
  console.log('Cloning medialab/ricardo_data (about 200 MB)...');
  execFileSync('git', ['clone', '--depth', '1', 'https://github.com/medialab/ricardo_data.git', REPO], { stdio: 'inherit' });
}
const DATA = path.join(REPO, 'data');
const readCSV = async (f) => parseCSV(await fsp.readFile(path.join(DATA, f), 'utf8'));

// RICardo entity names that need an explicit (often year-dependent) code.
const FIXED = {
  'Austria-Hungary (Austrian Empire)': (y) => (y < 1867 ? 'HAB' : 'AUH'),
  'Russia (USSR)': (y) => (y < 1922 ? 'RUS_EMP' : 'SUN'),
  'Turkey (Ottoman Empire)': (y) => (y < 1923 ? 'OTT' : 'TUR'),
  'Germany (Zollverein)': () => 'DEU',
  India: () => 'RAJ',
  'Yugoslavia (Kingdom of Serbs, Croats and Slovenes)': (y) => (y < 1918 ? 'SRB' : 'YUG'),
  'Korea (Chosen)': () => 'KOREA_HIST',
  'French West Africa & Togo (French Togoland)': () => 'FR_WEST_AFRICA',
  'French Indochina': () => 'FR_INDOCHINA',
  'French Equatorial Africa': () => 'FR_EQ_AFRICA',
  'Hawaii (Sandwich Is.)': () => 'HAWAII',
  Manchukuo: () => 'MANCHURIA',
  Zanzibar: () => 'ZAN',
  'Yemen Arab Republic (North Yemen) (Kingdom of Yemen)': () => 'YAR',
  "People's Republic of China (China)": (y) => (y < 1912 ? 'QING' : 'CHN_ROC'),
  'Republic of China (Taiwan) (Formosa)': () => 'TWN',
  'Virgin Islands (Danish West Indies)': () => 'VIR',
  Palestine: () => 'PSE',
  'Kingdom of Serbia': () => 'SRB',
  'St. Kitts-Nevis': () => 'KNA',
  'Turks and Caicos Is.': () => 'TCA',
};
// Partial territories or groups that do not match one data entity.
const SKIP = new Set(['Somaliland Republic (British Somaliland)', 'Cyrenaica', 'Crete', 'Ionian Is.', 'Canary Is.', 'Ceuta & Melilla',
  'British Oceania', 'German Oceania', 'Leeward Is.', 'French India', 'Portuguese India', 'Sabah (North Borneo)', 'Sarawak',
  'Newfoundland and Labrador (Newfoundland)', 'Kenya (British East Africa Protectorate) & Uganda', 'Lebanon & Syria', 'Ruanda-Urundi']);

const { resolveDataset: resolve } = await loadResolver();
function codeFor(ric, year) {
  if (!ric || SKIP.has(ric)) return null;
  if (FIXED[ric]) return FIXED[ric](year);
  const alternatives = [ric.replace(/\s*\(.*$/, ''), ...[...ric.matchAll(/\(([^)]+)\)/g)].map((m) => m[1])];
  for (const a of alternatives) {
    const c = resolve(a, year);
    if (c && !c.startsWith('PART:')) return c;
  }
  return null;
}
const displayName = (ric, year) => (ric === 'Russia (USSR)' && year >= 1922 ? 'Soviet Union' : ric.replace(/\s*\(.*$/, ''));

const names = new Map((await readCSV('entity_names.csv')).map((r) => [r.original_name, r.RICname]));
const entityType = new Map((await readCSV('RICentities.csv')).map((r) => [r.RICname, r.type]));
const expimp = new Map((await readCSV('expimp_spegen.csv')).map((r) => [`${r.export_import}|${r.special_general}`, r]));

const totals = { exports_usd: {}, imports_usd: {} };
// bilateral[code|year|Exp][source|spegen] = Map(partner -> value)
const bilateral = new Map();
const unmatched = new Map();

const files = (await fsp.readdir(path.join(DATA, 'flows'))).filter((f) => f.endsWith('.csv'));
for (const f of files) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DATA, 'flows', f), 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseCSVLine(line);
    if (!header) { header = cells; continue; }
    const r = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    const year = Number(r.year);
    const flow = Number(r.flow) * (Number(r.unit) || 1);
    if (!Number.isFinite(flow) || flow <= 0) continue;
    const ric = names.get(r.reporting);
    const code = codeFor(ric, year);
    if (!code) { if (ric) unmatched.set(ric, (unmatched.get(ric) ?? 0) + 1); continue; }
    const mod = expimp.get(`${r.export_import}|${r.special_general}`);
    const dir = mod?.modified_export_import ?? (r.export_import.startsWith('exp') ? 'Exp' : r.export_import.startsWith('imp') ? 'Imp' : null);
    if (dir !== 'Exp' && dir !== 'Imp') continue;

    if (r.world_trade_type === 'total_federicotena' && r.currency === 'us dollar') {
      const id = dir === 'Exp' ? 'exports_usd' : 'imports_usd';
      (totals[id][code] ??= {})[year] = (totals[id][code][year] ?? 0) + flow;
      continue;
    }
    if (r.world_trade_type || r.partner_sum) continue;
    const partner = names.get(r.partner);
    if (!partner || /world|unknown|\*\*\*/i.test(partner) || entityType.get(partner) === 'geographical_area') continue;
    const key = `${code}|${year}|${dir}`;
    const group = `${r.source}|${mod?.modified_special_general ?? r.special_general}`;
    if (!bilateral.has(key)) bilateral.set(key, new Map());
    const g = bilateral.get(key);
    if (!g.has(group)) g.set(group, new Map());
    const pm = g.get(group);
    pm.set(partner, (pm.get(partner) ?? 0) + flow);
  }
}

for (const [id, series] of Object.entries(totals)) {
  for (const years of Object.values(series)) for (const y of Object.keys(years)) years[y] = round(years[y]);
  await mergeMetricFile(id, series);
  console.log(`  ${id}: Federico-Tena totals for ${Object.keys(series).length} entities`);
}

// Top partners: within each territory-year-direction pick the single
// source table with the most partners (preferring general trade), so
// shares are never mixed across currencies or definitions.
await clearTradeContent('partners', (src) => src.startsWith('RICardo'));
const perFile = new Map();
for (const [key, groups] of bilateral) {
  const [code, year, dir] = key.split('|');
  let best = null;
  for (const [group, pm] of groups) {
    const score = pm.size + (group.endsWith('|Gen') ? 0.5 : 0);
    if (!best || score > best.score) best = { score, pm };
  }
  const total = [...best.pm.values()].reduce((a, b) => a + b, 0);
  if (best.pm.size < 3 || total <= 0) continue;
  const usdTotal = totals[dir === 'Exp' ? 'exports_usd' : 'imports_usd'][code]?.[year];
  const top = [...best.pm].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, v]) => ({
    name: displayName(p, Number(year)),
    share: round((v / total) * 100),
    value: usdTotal ? round((v / total) * usdTotal) : null,
  }));
  const fk = `${code}|${year}`;
  if (!perFile.has(fk)) perFile.set(fk, {});
  perFile.get(fk)[dir === 'Exp' ? 'exports' : 'imports'] = top;
}
for (const [fk, partners] of perFile) {
  const [code, year] = fk.split('|');
  await patchTradeFile(code, year, { partners, sources: { partners: 'RICardo (bilateral trade statistics, 1800-1938)' } });
}
await rebuildTradeIndex();
console.log(`  partners: ${perFile.size} territory-years`);
const top = [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => `${n} (${c})`);
console.log(`  reporting names without an entity (largest first): ${top.join('; ')}`);

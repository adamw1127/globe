// Builds the "wars" metric ({ entityCode: { year: [war names] } }) from
// published datasets only:
//
//  - 1600-1815: Brecke, Conflict Catalog (Georgia Tech), conflicts with at
//    least 1,000 recorded deaths, plus campaigns the catalog names as part
//    of such a war (e.g. "Swedish-Imperial War (Thirty Years' War)", which
//    has no death count of its own). Parties come from the catalog's own
//    conflict names (e.g. "Poland-Sweden, 1600-11"). The catalog lists the
//    Thirty Years' War, the French Revolutionary Wars and the Napoleonic
//    Wars both as one umbrella entry without parties and as component
//    campaigns with parties and dates; the components are used.
//  - 1816-2007 (civil wars to 2014): Correlates of War inter-state,
//    extra-state and intra-state war data (1,000+ battle deaths).
//  - After that: UCDP/PRIO Armed Conflict Dataset, conflict-years at war
//    intensity (1,000+ battle deaths in the year). Supporting states are
//    marked "(supporting party)".
//
// Parties that do not match a data entity (rebel groups, small polities)
// are skipped; the script lists them so the mapping can be extended.
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { CACHE_DIR, METRICS_DIR, cachedDownload, writeJSON, sortSeries } from './lib/util.mjs';
import { parseCSV } from './lib/owid.mjs';
import { loadResolver } from './lib/entities.mjs';

const COW = 'https://correlatesofwar.org/wp-content/uploads';
const files = {
  inter: await cachedDownload(`${COW}/Inter-StateWarData_v4.0.csv`, 'wars/Inter-StateWarData_v4.0.csv'),
  extra: await cachedDownload(`${COW}/Extra-StateWarData_v4.0.csv`, 'wars/Extra-StateWarData_v4.0.csv'),
  intraZip: await cachedDownload(`${COW}/Intra-State-Wars-v5.1.zip`, 'wars/Intra-State-Wars-v5.1.zip'),
  cowCodes: await cachedDownload(`${COW}/COW-country-codes.csv`, 'wars/cow-codes.csv'),
  ucdpZip: await cachedDownload('https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-261-csv.zip', 'wars/ucdp.zip'),
  gw: await cachedDownload('http://ksgleditsch.com/data/iisystem.dat', 'wars/gw-system.dat'),
  brecke: await cachedDownload('https://brecke.inta.gatech.edu/wp-content/uploads/sites/19/2018/09/Conflict-Catalog-18-vars.xlsx', 'wars/brecke.xlsx'),
};
const { execFileSync } = await import('node:child_process');
const warsDir = path.join(CACHE_DIR, 'wars');
execFileSync('unzip', ['-o', '-q', files.intraZip, '-d', path.join(warsDir, 'intra')]);
execFileSync('unzip', ['-o', '-q', files.ucdpZip, '-d', warsDir]);
const readCSV = async (f, enc = 'latin1') => parseCSV((await fs.readFile(f, enc)).replace(/\r\n?/g, '\n'));

const COW_LAST = { inter: 2007, extra: 2007, intra: 2014 };
const { resolveDataset: resolve } = await loadResolver();
const out = {};
const unmatched = new Map();
function add(code, from, to, name) {
  if (!code || code.startsWith('PART:')) return;
  for (let y = Math.max(from, 1600); y <= to; y++) {
    const list = ((out[code] ??= {})[y] ??= []);
    if (!list.includes(name)) list.push(name);
  }
}
const miss = (label) => unmatched.set(label, (unmatched.get(label) ?? 0) + 1);

// ---------- Correlates of War ----------
const cowNames = new Map((await readCSV(files.cowCodes)).map((r) => [Number(r.CCode), r.StateNme]));
function cowEntity(ccode, year) {
  const c = Number(ccode);
  const fixed = {
    365: year < 1922 ? 'RUS_EMP' : year <= 1991 ? 'SUN' : 'RUS',
    255: year < 1871 ? 'PRUSSIA' : 'DEU',
    260: 'BRD', 265: 'DDR',
    300: year < 1867 ? 'HAB' : 'AUH', 305: 'AUT',
    640: year < 1923 ? 'OTT' : 'TUR',
    710: year < 1912 ? 'QING' : year < 1949 ? 'CHN_ROC' : 'CHN',
    345: year < 1918 ? 'SRB' : year <= 1992 ? 'YUG' : 'SRB',
    315: 'CSK', 316: 'CZE', 317: 'SVK',
    730: 'KOREA_HIST', 731: 'PRK', 732: 'KOR',
    816: year <= 1976 ? 'DRV' : 'VNM', 817: 'RVN',
    678: 'YAR', 679: 'YEM', 680: 'YPR',
    240: 'HAN', 245: 'BAV', 267: 'BAD', 269: 'SAX', 271: 'WUR', 273: 'HSE', 275: 'HSG', 280: 'MEC',
    325: year < 1861 ? 'SAR' : 'ITA', 327: 'PAP', 329: 'SIC', 332: 'MOD', 335: 'PMA', 337: 'TUS',
    511: 'ZAN', 200: 'GBR', 220: 'FRA', 230: 'ESP', 390: 'DNK', 380: 'SWE', 210: 'NLD',
    630: 'IRN', 750: 'IND', 770: 'PAK', 775: 'MMR', 800: 'THA', 437: 'CIV', 490: 'COD', 484: 'COG',
    572: 'SWZ', 343: 'MKD', 860: 'TLS', 347: 'XKX',
  };
  if (c in fixed) return fixed[c];
  const name = cowNames.get(c);
  const code = name ? resolve(name, year) : null;
  if (!code) miss(`COW ${c} ${name}`);
  return code;
}
const yr = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
function periods(row, keys, last) {
  const out = [];
  for (const [s, e] of keys) {
    const from = yr(row[s]);
    if (!from) continue;
    const end = Number(row[e]) === -7 ? last : yr(row[e]) ?? from;
    out.push([from, end]);
  }
  return out;
}

let cowWars = 0;
for (const r of await readCSV(files.inter)) {
  for (const [a, b] of periods(r, [['StartYear1', 'EndYear1'], ['StartYear2', 'EndYear2']], COW_LAST.inter)) {
    add(cowEntity(r.ccode, a), a, b, r.WarName.trim());
  }
  cowWars++;
}
for (const r of await readCSV(files.extra)) {
  const keys = Object.keys(r);
  const endYear2 = keys.find((k) => k.trim() === 'EndYear2');
  for (const [a, b] of periods(r, [['StartYear1', 'EndYear1'], ['StartYear2', endYear2]], COW_LAST.extra)) {
    for (const cc of [r.ccode1, r.ccode2]) if (Number(cc) > 0) add(cowEntity(cc, a), a, b, r.WarName.trim());
  }
  cowWars++;
}
const intraFile = path.join(warsDir, 'intra', 'INTRA-STATE_State_participants v5.1 CSV.csv');
for (const r of await readCSV(intraFile)) {
  const ps = periods(r, [['StartYr1', 'EndYr1'], ['StartYr2', 'EndYr2'], ['StartYr3', 'EndYr3'], ['StartYr4', 'EndYr4']], COW_LAST.intra);
  for (const [a, b] of ps) {
    for (const cc of [r.CcodeA, r.CcodeB]) if (Number(cc) > 0) add(cowEntity(cc, a), a, b, r.WarName.trim());
  }
  cowWars++;
}

// ---------- UCDP/PRIO after COW coverage ----------
const gwNames = new Map(
  (await fs.readFile(files.gw, 'latin1')).split(/\r?\n/).filter(Boolean).map((l) => {
    const [code, , name] = l.split('\t');
    return [Number(code), name];
  }),
);
function gwEntity(gw, year) {
  const c = Number(gw);
  const fixed = { 260: 'DEU', 340: 'SRB', 345: 'SRB', 365: 'RUS', 678: 'YEM', 816: 'VNM', 347: 'XKX', 626: 'SSD', 437: 'CIV', 490: 'COD', 484: 'COG', 775: 'MMR', 510: 'TZA', 731: 'PRK', 732: 'KOR', 325: 'ITA', 360: 'ROU' };
  if (c in fixed) return fixed[c];
  const name = gwNames.get(c);
  const code = name ? resolve(name, year) : null;
  if (!code) miss(`GW ${c} ${name}`);
  return code;
}
const ucdpFile = (await fs.readdir(warsDir)).find((f) => /^UcdpPrioConflict.*\.csv$/.test(f));
let ucdpRows = 0;
for (const r of await readCSV(path.join(warsDir, ucdpFile), 'utf8')) {
  const year = Number(r.year);
  const interstate = r.type_of_conflict === '2';
  if (r.intensity_level !== '2') continue;
  if (year <= (interstate ? COW_LAST.inter : COW_LAST.intra)) continue;
  const name = `${r.location}: ${r.side_a.replace(/^Government of /, '')} vs. ${r.side_b.replace(/^Government of /, '')}`;
  const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
  for (const gw of [...list(r.gwno_a), ...list(r.gwno_b)]) add(gwEntity(gw, year), year, year, name);
  for (const gw of [...list(r.gwno_a_2nd), ...list(r.gwno_b_2nd)]) add(gwEntity(gw, year), year, year, `${name} (supporting party)`);
  ucdpRows++;
}

// ---------- Brecke Conflict Catalog, 1600-1815 ----------
// Party names used in the catalog, mapped to entities for the year.
const BRECKE = {
  England: (y) => (y < 1707 ? 'ENG_IRL' : 'GBR'), Britain: (y) => (y < 1707 ? 'ENG_IRL' : 'GBR'), UK: () => 'GBR', 'Great Britain': () => 'GBR',
  Scotland: (y) => (y < 1707 ? 'SCOTLAND' : 'GBR'), Ireland: (y) => (y <= 1800 ? 'IRELAND_KGD' : 'GBR'),
  France: () => 'FRA', Spain: () => 'ESP', Portugal: () => 'PRT', Port: () => 'PRT',
  Netherlands: () => 'NLD', 'United Provinces': () => 'NLD', UP: () => 'NLD', Dutch: () => 'NLD', Holland: () => 'NLD',
  Sweden: () => 'SWE', Denmark: (y) => (y < 1814 ? 'DEN_NOR' : 'DNK'), 'Denmark-Norway': () => 'DEN_NOR',
  Poland: (y) => (y <= 1795 ? 'PLC' : 'POL'), 'Poland-Lithuania': () => 'PLC',
  Russia: (y) => (y < 1721 ? 'MUSCOVY' : 'RUS_EMP'), Muscovy: () => 'MUSCOVY',
  Austria: () => 'HAB', 'Holy Roman Empire': () => 'HRE', Empire: () => 'HRE',
  Prussia: () => 'PRUSSIA', Brandenburg: () => 'PRUSSIA', 'Brandenburg-Prussia': () => 'PRUSSIA',
  Saxony: () => 'SAX', Bavaria: () => 'BAV', Bav: () => 'BAV', Hanover: () => 'HAN',
  Savoy: () => 'SAR', Sardinia: () => 'SAR', Piedmont: () => 'SAR', Venice: () => 'VENICE', Genoa: () => 'GENOA',
  'Papal States': () => 'PAP', Papacy: () => 'PAP', Naples: () => 'SIC', 'Two Sicilies': () => 'SIC', Tuscany: () => 'TUS', Modena: () => 'MOD', Parma: () => 'PMA',
  Turkey: () => 'OTT', 'Ottoman Empire': () => 'OTT', Ottomans: () => 'OTT',
  Persia: (y) => (y < 1736 ? 'SAFAVID' : 'IRN'), Iran: (y) => (y < 1736 ? 'SAFAVID' : 'IRN'),
  Crimea: () => 'CRIMEA', 'Crimean Tatars': () => 'CRIMEA', Morocco: () => 'MAR',
  'Mughal Empire': () => 'MUGHAL', Mughals: () => 'MUGHAL', Moguls: () => 'MUGHAL', Marathas: () => 'MARATHA',
  China: (y) => (y < 1644 ? 'MING' : 'QING'), Japan: () => 'JPN', Korea: () => 'KOREA_HIST',
  Burma: () => 'MMR', Thailand: () => 'THA', Siam: () => 'THA', Vietnam: () => 'VNM', Annam: () => 'VNM', Cambodia: () => 'KHM',
  Afghanistan: () => 'AFG', Nepal: () => 'NPL', Ethiopia: () => 'ETH',
  USA: () => 'USA', 'United States': () => 'USA', US: () => 'USA', Switzerland: () => 'CHE', Haiti: () => 'HTI', Mexico: () => 'MEX',
  Wurttemberg: () => 'WUR', Württemberg: () => 'WUR', Baden: () => 'BAD',
  // The catalog's "emperor" is the Holy Roman Emperor.
  emperor: () => 'HRE', Emperor: () => 'HRE', Sax: () => 'SAX', 'Crimean Tartars': () => 'CRIMEA', Serbia: () => 'SRB',
};
function breckeEntity(raw, year) {
  const label = raw.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  if (!label) return null;
  if (BRECKE[label]) return BRECKE[label](year);
  miss(`Brecke ${label}`);
  return null;
}
// "A, B-C, D, 1700-21" -> parties [A, B, C, D]; "Poland (Cossacks, with
// intervention by Tatars), 1651-54" -> [Poland, Tatars].
function breckeParties(name) {
  const base = name.replace(/,\s*\d{4}(-\d{1,4})?\s*\??\s*$/, '').replace(/^\(([^)]*)\)/, '$1');
  const interventions = [...base.matchAll(/intervention by ([^)]*)/gi)].flatMap((m) => m[1].split(/,| and /).map((s) => s.trim()));
  const outside = base.replace(/\([^)]*\)/g, '');
  const parties = outside.includes('-') ? outside.split('-').flatMap((side) => side.split(',')) : [outside.split(',')[0]];
  return [...parties, ...interventions].map((s) => s.trim()).filter(Boolean);
}

const UMBRELLA = new Set(["Thirty Years' War", 'Wars of the French Revolution', 'Napoleonic Wars']);
const catalog = XLSX.utils.sheet_to_json(XLSX.readFile(files.brecke).Sheets['Conflict Catalog 18 vars.xls'])
  .filter((r) => r.StartYear >= 1600 && r.StartYear < 1816);
const major = new Set(catalog.filter((r) => r.TotalFatalities >= 1000 && r['Common Name']).map((r) => r['Common Name']));
const partOfMajor = (r) => {
  const m = (r['Common Name'] ?? '').match(/\(([^)]+)\)\s*(in .*)?$/);
  return Boolean(m && major.has(m[1]));
};
let breckeWars = 0;
for (const r of catalog) {
  if (UMBRELLA.has(r['Common Name'])) continue;
  if (!(r.TotalFatalities >= 1000) && !partOfMajor(r)) continue;
  const name = r['Common Name'] || r.Name.replace(/,\s*\d{4}(-\d{1,4})?\s*\??\s*$/, '');
  const from = r.StartYear;
  const to = Math.min(r.EndYear || r.StartYear, 1815);
  for (const party of breckeParties(r.Name)) add(breckeEntity(party, from), from, to, name);
  breckeWars++;
}

await writeJSON(path.join(METRICS_DIR, 'wars.json'), sortSeries(out));
console.log(`  wars: ${breckeWars} Brecke conflicts (1600-1815), ${cowWars} COW war rows, ${ucdpRows} UCDP war-years; ${Object.keys(out).length} entities`);
const top = [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([n, c]) => `${n} (${c})`);
console.log(`  parties without a data entity (most frequent): ${top.join('; ')}`);

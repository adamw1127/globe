// Resolves territory or source-dataset names to data entity codes
// (ISO3 for modern countries, keys from entities.json for historical ones).
import path from 'node:path';
import { DATA_DIR, readJSON } from './util.mjs';

// Alternate spellings that show up across the datasets.
const EXTRA_NAMES = {
  'united states': 'USA', 'russia': 'RUS', 'iran': 'IRN', 'egypt': 'EGY', 'syria': 'SYR', 'venezuela': 'VEN',
  'south korea': 'KOR', 'north korea': 'PRK', 'laos': 'LAO', 'vietnam': 'VNM', 'czech republic': 'CZE', 'czechia': 'CZE',
  'slovakia': 'SVK', 'kyrgyzstan': 'KGZ', 'yemen': 'YEM', 'gambia': 'GMB', 'bahamas': 'BHS', 'micronesia': 'FSM',
  'turkey': 'TUR', 'turkiye': 'TUR', 'brunei': 'BRN', 'cape verde': 'CPV', 'congo, democratic republic': 'COD',
  'democratic republic of congo': 'COD', 'democratic republic of the congo': 'COD', 'congo kinshasa': 'COD',
  'congo brazzaville': 'COG', 'republic of the congo': 'COG', 'ivory coast': 'CIV', "cote d'ivoire": 'CIV',
  'east timor': 'TLS', 'timor': 'TLS', 'macedonia': 'MKD', 'north macedonia': 'MKD', 'swaziland': 'SWZ', 'eswatini': 'SWZ',
  'burma': 'MMR', 'myanmar': 'MMR', 'saint lucia': 'LCA', 'saint kitts and nevis': 'KNA', 'saint vincent and the grenadines': 'VCT',
  'saint martin': 'MAF', 'sint maarten': 'SXM', 'hong kong': 'HKG', 'macao': 'MAC', 'macau': 'MAC', 'taiwan': 'TWN',
  'palestine': 'PSE', 'west bank and gaza': 'PSE', 'kosovo': 'XKX', 'slovak republic': 'SVK', 'trinidad': 'TTO',
  'guadeloupe': 'GLP', 'martinique': 'MTQ', 'french guiana': 'GUF', 'reunion': 'REU', 'western sahara': 'ESH',
  'netherlands antilles': 'ANT', 'anguilla': 'AIA', 'montserrat': 'MSR', 'niue': 'NIU', 'wallis and futuna islands': 'WLF',
  'saint barthelemy': 'BLM', 'greenland': 'GRL', 'united states virgin islands': 'VIR', 'byelarus': 'BLR',
  'antarctica': 'ATA', 'new caledonia': 'NCL', 'guam': 'GUM', 'saipan': 'MNP', 'new hebrides': 'VUT',
  'gilbert and ellice islands': 'KIR', 'bosnia-herzegovina': 'BIH', 'byelorussia': 'BLR',
};

export function normalize(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9',\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function loadResolver() {
  const countries = await readJSON(path.join(DATA_DIR, 'countries.json'));
  const entities = await readJSON(path.join(DATA_DIR, 'entities.json'));
  const byName = new Map();
  for (const [iso3, c] of Object.entries(countries)) {
    byName.set(normalize(c.name), iso3);
    // "Korea, Rep." style names: also index the part before the comma.
    const base = c.name.split(',')[0];
    if (!byName.has(normalize(base))) byName.set(normalize(base), iso3);
  }
  for (const [n, code] of Object.entries(EXTRA_NAMES)) byName.set(n, code);

  function applyRule(value, year) {
    if (value && typeof value === 'object' && value.partOf) return `PART:${value.partOf}`;
    if (!Array.isArray(value)) return value;
    for (const rule of value) {
      if (rule.until === undefined || (year !== undefined && year <= rule.until)) return rule.code;
    }
    return null;
  }

  // Returns an entity code, "PART:<ISO3>" for a territory that is only part of
// a modern state, or null when nothing matches.
  function resolve(name, year) {
    if (!name || !name.trim()) return null;
    if (entities.aliases[name] !== undefined) return applyRule(entities.aliases[name], year);
    const n = normalize(name);
    if (byName.has(n)) return byName.get(n);
    return null;
  }

  // For names that come from datasets rather than map labels: a dataset's
  // "Ukraine" is the state, so modern country names win over the map-label
  // aliases (where "Ukraine" on the 1920 map is only part of the country).
  function resolveDataset(name, year) {
    if (!name || !name.trim()) return null;
    const n = normalize(name);
    if (byName.has(n)) return byName.get(n);
    const code = resolve(name, year);
    return code && !code.startsWith('PART:') ? code : null;
  }

  return { resolve, resolveDataset, countries, entities, normalize };
}

// Reads Our World in Data grapher CSVs (free, no key) and maps their
// entity codes to ours. OWID_* codes cover historical states.
import fs from 'node:fs/promises';
import { cachedDownload, round } from './util.mjs';

export const OWID_CODES = {
  OWID_USS: 'SUN', OWID_YGS: 'YUG', OWID_CZS: 'CSK', OWID_GDR: 'DDR', OWID_GFR: 'BRD', OWID_KOS: 'XKX',
  OWID_BAV: 'BAV', OWID_SAX: 'SAX', OWID_HAN: 'HAN', OWID_BAD: 'BAD', OWID_WRL: 'WUR', OWID_HSE: 'HSE',
  OWID_HSG: 'HSG', OWID_MEC: 'MEC', OWID_MOD: 'MOD', OWID_PMA: 'PMA', OWID_SIC: 'SIC', OWID_TUS: 'TUS',
  OWID_ZAN: 'ZAN', OWID_RVN: 'RVN', OWID_DRV: 'DRV', OWID_YAR: 'YAR', OWID_YPR: 'YPR',
};

// Minimal CSV line parser (handles quoted fields).
export function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCSVLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = parseCSVLine(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

// Returns { code: { year: value } } for one column of a grapher chart.
export async function loadOwidSeries(slug, column, { fromYear = 1600, validCodes } = {}) {
  const url = `https://ourworldindata.org/grapher/${slug}.csv?v=1&csvType=full&useColumnShortNames=true`;
  const file = await cachedDownload(url, `owid-${slug}.csv`);
  const rows = parseCSV(await fs.readFile(file, 'utf8'));
  if (!rows.length || !(column in rows[0])) {
    throw new Error(`Column ${column} not in ${slug}: ${Object.keys(rows[0] ?? {}).join(', ')}`);
  }
  const series = {};
  for (const r of rows) {
    const code = OWID_CODES[r.code] ?? (r.code && !r.code.startsWith('OWID_') ? r.code : null);
    if (!code || (validCodes && !validCodes.has(code) && !Object.values(OWID_CODES).includes(code))) continue;
    const year = Number(r.year);
    const v = r[column] === '' ? null : Number(r[column]);
    if (year < fromYear || v === null || !Number.isFinite(v)) continue;
    (series[code] ??= {})[year] = round(v);
  }
  return series;
}

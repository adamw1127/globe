// Correlates of War state codes -> data entity codes, by year.
import fs from 'node:fs/promises';
import { cachedDownload } from './util.mjs';
import { parseCSV } from './owid.mjs';

export async function loadCowEntity(resolve, onMiss = () => {}) {
  const file = await cachedDownload('https://correlatesofwar.org/wp-content/uploads/COW-country-codes.csv', 'wars/cow-codes.csv');
  const rows = parseCSV((await fs.readFile(file, 'latin1')).replace(/\r\n?/g, '\n'));
  const cowNames = new Map(rows.map((r) => [Number(r.CCode), r.StateNme]));
  return function cowEntity(ccode, year) {
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
    if (!code) onMiss(`COW ${c} ${name}`);
    return code;
  };
}

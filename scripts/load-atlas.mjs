// Harvard Growth Lab, Atlas of Economic Complexity: goods trade by product
// and by partner, 1962 onward. https://atlas.hks.harvard.edu (free GraphQL
// API, no key). Values are the Atlas's cleaned UN Comtrade data, which
// reconciles each flow using both the exporter's and importer's reports.
//
// Products: SITC rev. 2 (4-digit) for 1962-1994, HS 1992 (4-digit) from
// 1995. Partners: all years 1962 onward. Shares are of the territory's
// total goods trade that year. Services are excluded.
//
// Writes top 5 exports, imports and partners into
// public/data/trade/<CODE>/<year>.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, round, pool } from './lib/util.mjs';
import { patchTradeFile, clearTradeContent, rebuildTradeIndex } from './lib/trade.mjs';

const API = 'https://atlas.hks.harvard.edu/api/graphql';
const HS_FROM = 1995;
const SOURCE = 'Atlas of Economic Complexity (Harvard Growth Lab), goods only';
// Pseudo-partners that are not countries.
const NOT_PARTNERS = new Set(['USP', 'ANS']);

// Atlas codes whose meaning changed over time.
function codeFor(iso3, year) {
  // Before 1992 Atlas files the USSR under Russia's code, built only from
  // partners' reports (the USSR did not report), so it badly understates
  // Soviet trade. Soviet trade comes from official Soviet statistics
  // instead (scripts/load-sess.mjs).
  if (iso3 === 'RUS' && year < 1992) return null;
  // Before reunification "Germany" is the Federal Republic (West Germany).
  if (iso3 === 'DEU' && year < 1991) return 'BRD';
  if (iso3 === 'ANT') return 'ANT';
  return iso3;
}

const cacheDir = path.join(CACHE_DIR, 'atlas');
await fs.mkdir(cacheDir, { recursive: true });
let lastCall = 0;
async function query(name, q) {
  const file = path.join(cacheDir, `${name}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {}
  for (let attempt = 0; attempt < 6; attempt++) {
    // Stay well under the API's rate limit.
    const wait = Math.max(0, lastCall + 700 - Date.now());
    lastCall = Date.now() + wait;
    await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
      if (res.status === 429) throw new Error('rate limited');
      const body = await res.json();
      if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 300));
      await fs.writeFile(file, JSON.stringify(body.data));
      return body.data;
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
    }
  }
}

const { locationCountry } = await query('countries', '{ locationCountry { countryId iso3Code nameShortEn } }');
const countryById = new Map(locationCountry.map((c) => [c.countryId, c]));
const productNames = new Map();
for (const cls of ['Sitc', 'Hs92']) {
  const key = `product${cls}`;
  const d = await query(`products-${cls}`, `{ ${key}(productLevel: 4) { productId code nameShortEn } }`);
  for (const p of d[key]) productNames.set(p.productId, { name: p.nameShortEn, code: `${cls === 'Sitc' ? 'SITC' : 'HS'} ${p.code}` });
}
const { dataAvailability } = await query('availability', '{ dataAvailability { productClassification yearMin yearMax } }');
const sitc = dataAvailability.find((d) => d.productClassification === 'SITC');
const hs = dataAvailability.find((d) => d.productClassification === 'HS92');

function topFive(rows, key, nameOf, totalsByYear) {
  const byYear = new Map();
  for (const r of rows) {
    const v = r[key];
    if (!v || v <= 0) continue;
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    const n = nameOf(r);
    if (!n) continue;
    byYear.get(r.year).push({ ...(typeof n === 'object' ? n : { name: n }), value: v });
  }
  const out = new Map();
  for (const [year, list] of byYear) {
    const total = totalsByYear?.get(year) ?? list.reduce((a, b) => a + b.value, 0);
    if (!total) continue;
    const top = list.filter((x) => x.name).sort((a, b) => b.value - a.value).slice(0, 5);
    out.set(year, top.map(({ value, ...x }) => ({ ...x, share: round((value / total) * 100), value: round(value) })));
  }
  return out;
}

await clearTradeContent('products', (src) => src.startsWith('Atlas'));
await clearTradeContent('partners', (src) => src.startsWith('Atlas'));

const countries = locationCountry.filter((c) => !NOT_PARTNERS.has(c.iso3Code) && c.iso3Code);
let files = 0;
let done = 0;
await pool(countries, 2, async (c) => {
  const id = Number(c.countryId.replace('country-', ''));
  const fields = 'productId year exportValue importValue';
  const [a, b, p] = await Promise.all([
    query(`cpy-sitc-${c.iso3Code}`, `{ countryProductYear(countryId: ${id}, productClass: SITC, productLevel: 4, yearMin: ${sitc.yearMin}, yearMax: ${HS_FROM - 1}) { ${fields} } }`),
    query(`cpy-hs92-${c.iso3Code}`, `{ countryProductYear(countryId: ${id}, productClass: HS92, productLevel: 4, yearMin: ${HS_FROM}, yearMax: ${hs.yearMax}) { ${fields} } }`),
    query(`ccy-${c.iso3Code}`, `{ countryCountryYear(countryId: ${id}, productClass: SITC, yearMin: ${sitc.yearMin}, yearMax: ${sitc.yearMax}) { partnerCountryId year exportValue importValue } }`),
  ]);
  // Goods only: Atlas also returns services categories (travel, transport,
  // ICT...) whose codes are not numeric. Goods totals include the
  // "not specified according to kind" lines, but those are not ranked as
  // products.
  const products = [...a.countryProductYear, ...b.countryProductYear].filter((r) => /\d{4}$/.test(productNames.get(r.productId)?.code ?? ''));
  const goodsTotals = (key) => {
    const t = new Map();
    for (const r of products) if (r[key] > 0) t.set(r.year, (t.get(r.year) ?? 0) + r[key]);
    return t;
  };
  const partnerRows = p.countryCountryYear.filter((r) => !NOT_PARTNERS.has(countryById.get(r.partnerCountryId)?.iso3Code));
  const UNSPECIFIED = /not (specified|classified) according to kind|^unspecified|special transactions/i;
  const productName = (r) => {
    const p = productNames.get(r.productId);
    return p && !UNSPECIFIED.test(p.name) ? p : null;
  };
  // Atlas uses today's codes for partners in all years: before 1991 "Germany"
  // is West Germany and before 1992 "Russia" is the Soviet Union.
  const partnerName = (r) => {
    const c = countryById.get(r.partnerCountryId);
    if (c?.iso3Code === 'DEU' && r.year < 1991) return 'West Germany';
    if (c?.iso3Code === 'RUS' && r.year < 1992) return 'Soviet Union';
    return c?.nameShortEn;
  };

  const exp = topFive(products, 'exportValue', productName, goodsTotals('exportValue'));
  const imp = topFive(products, 'importValue', productName, goodsTotals('importValue'));
  const pexp = topFive(partnerRows, 'exportValue', partnerName);
  const pimp = topFive(partnerRows, 'importValue', partnerName);

  const years = new Set([...exp.keys(), ...imp.keys(), ...pexp.keys(), ...pimp.keys()]);
  for (const year of years) {
    const code = codeFor(c.iso3Code, year);
    if (!code) continue;
    const patch = { sources: {} };
    if (exp.has(year) && imp.has(year)) {
      const rename = (list) => list.map(({ name, ...rest }) => ({ product: name, ...rest }));
      patch.exports = rename(exp.get(year));
      patch.imports = rename(imp.get(year));
      patch.sources.products = `${SOURCE}, ${year < HS_FROM ? 'SITC rev. 2' : 'HS 1992'} 4-digit products`;
    }
    if (pexp.has(year) || pimp.has(year)) {
      patch.partners = {};
      if (pexp.has(year)) patch.partners.exports = pexp.get(year);
      if (pimp.has(year)) patch.partners.imports = pimp.get(year);
      patch.sources.partners = SOURCE;
    }
    await patchTradeFile(code, year, patch);
    files++;
  }
  if (++done % 20 === 0) console.log(`  ${done}/${countries.length} territories`);
});
await rebuildTradeIndex();
console.log(`  atlas: ${files} territory-years with real product and partner data`);

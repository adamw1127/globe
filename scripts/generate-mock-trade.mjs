// MOCK DATA FOR TESTING ONLY. Generates "Top 5 exports / imports" by
// product (and modern-era partners) so the trade UI can be exercised
// before real product-level data (e.g. BACI or UN Comtrade) is swapped in.
//
// Respects coverage: a file is generated only for territory-years in
// MOCK_FROM..latest where the real exports_usd / imports_usd metric has a
// value, and dollar values are shares of those real totals. Every file is
// marked sources.products = "MOCK" and the UI labels it as sample data.
//
//   node scripts/generate-mock-trade.mjs          generate
//   node scripts/generate-mock-trade.mjs --clear  remove all mock content
import path from 'node:path';
import { METRICS_DIR, readJSON, round } from './lib/util.mjs';
import { patchTradeFile, clearTradeContent, rebuildTradeIndex } from './lib/trade.mjs';

const MOCK_FROM = 2010;
const PRODUCTS = [
  'Machinery & equipment', 'Electronics', 'Vehicles & parts', 'Crude oil', 'Refined petroleum', 'Natural gas',
  'Pharmaceuticals', 'Chemicals', 'Plastics & rubber', 'Iron & steel', 'Precious metals & stones', 'Ores & minerals',
  'Cereals', 'Meat & fish', 'Fruit & vegetables', 'Textiles & clothing', 'Wood & paper', 'Medical instruments',
];
const PARTNERS = ['China', 'United States', 'Germany', 'Japan', 'France', 'United Kingdom', 'India', 'South Korea',
  'Netherlands', 'Italy', 'Canada', 'Mexico', 'Brazil', 'Russia', 'Spain', 'Singapore', 'Saudi Arabia', 'South Africa'];

// Deterministic PRNG so reruns produce identical files.
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable per-territory weights, drifting a little from year to year.
function topFive(list, code, kind, year, total, exclude) {
  const base = rng(`${code}:${kind}`);
  const drift = rng(`${code}:${kind}:${year}`);
  const weights = list.map((name) => ({ name, w: base() ** 3 * (0.85 + drift() * 0.3) }))
    .filter((x) => x.name !== exclude);
  const sum = weights.reduce((a, b) => a + b.w, 0) / (0.55 + base() * 0.3); // top 5 cover ~55-85%
  return weights.sort((a, b) => b.w - a.w).slice(0, 5).map(({ name, w }) => {
    const share = round((w / sum) * 100);
    return { name, share, value: round((share / 100) * total) };
  });
}

await clearTradeContent('products');
if (process.argv.includes('--clear')) {
  await rebuildTradeIndex();
  console.log('Removed mock product data.');
  process.exit(0);
}

const exportsUsd = await readJSON(path.join(METRICS_DIR, 'exports_usd.json'));
const importsUsd = await readJSON(path.join(METRICS_DIR, 'imports_usd.json'));
const countries = await readJSON(path.join(METRICS_DIR, '../countries.json'));
let n = 0;
for (const [code, years] of Object.entries(exportsUsd)) {
  if (!countries[code]) continue;
  for (const [y, exp] of Object.entries(years)) {
    const year = Number(y);
    const imp = importsUsd[code]?.[y];
    if (year < MOCK_FROM || !exp || !imp) continue;
    const self = countries[code].name;
    const rename = (r) => r.map(({ name, ...rest }) => ({ product: name, ...rest }));
    await patchTradeFile(code, year, {
      exports: rename(topFive(PRODUCTS, code, 'exp', year, exp)),
      imports: rename(topFive(PRODUCTS, code, 'imp', year, imp)),
      partners: {
        exports: topFive(PARTNERS, code, 'pexp', year, exp, self),
        imports: topFive(PARTNERS, code, 'pimp', year, imp, self),
      },
      sources: { products: 'MOCK', partners: 'MOCK' },
    });
    n++;
  }
}
await rebuildTradeIndex();
console.log(`  mock trade: ${n} territory-years (${MOCK_FROM} onward, only where real export and import totals exist)`);

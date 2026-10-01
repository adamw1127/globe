// Soviet foreign trade from the USSR's own official statistics
// (Vneshnyaya torgovlya SSSR, the Ministry of Foreign Trade yearbooks), as
// digitized in the Soviet and Russian Economic Statistical Series (SESS),
// Slavic-Eurasian Research Center, Hokkaido University:
// https://src-h.slav.hokudai.ac.jp/database/SESS.html
//
// Writes, for the USSR (entity SUN), top 5 export and import partners
// (S712, S713: million rubles by country) and top 5 commodity groups
// (S721, S722: % of total by Soviet commodity group). Values stay in the
// published currency (rubles); nothing is converted or estimated.
//
// The tables use 0 for "no figure", and part of Soviet exports was never
// attributed to a named country (mostly to developing countries, widely
// believed to be arms). A year's top 5 partners is only published when the
// value not attributed to a listed country is smaller than the 5th
// partner's, so no unlisted country can outrank one that is shown.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, round } from './lib/util.mjs';
import { parseCSVLine } from './lib/owid.mjs';
import { patchTradeFile, clearTradeContent, rebuildTradeIndex } from './lib/trade.mjs';

const BASE = 'https://src-h.slav.hokudai.ac.jp/database/USSR';
const SOURCE = 'Official Soviet trade statistics (Vneshnyaya torgovlya SSSR) via SESS, Hokkaido University';
const CODE = 'SUN';
// Rows that are groups of countries, not countries.
const AGGREGATE = /Total|Socialist Countries|CMEA Member|Capitalist Countries|Developping Countries|Developing Countries/i;
const DISPLAY = {
  Chechoslovakia: 'Czechoslovakia', kampuchea: 'Kampuchea', 'Sierra leone': 'Sierra Leone', Cameroun: 'Cameroon',
  'Great Britain': 'United Kingdom', 'Federal Republic of Germany': 'West Germany', 'German Democratic Republic': 'East Germany',
  "Korean People's Democratic Republic": 'North Korea', "Mongolian People's Republic": 'Mongolia',
  'Republic of South Africa': 'South Africa', 'United States of America': 'United States',
};

const dir = path.join(CACHE_DIR, 'sess');
await fs.mkdir(dir, { recursive: true });
async function table(name) {
  const file = path.join(dir, `${name}.csv`);
  let text;
  try {
    text = await fs.readFile(file, 'latin1');
  } catch {
    const res = await fetch(`${BASE}/${name}.csv`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(file, buf);
    text = buf.toString('latin1');
  }
  const lines = text.split(/\r?\n/).filter(Boolean).map(parseCSVLine);
  const header = lines[0];
  const years = header.slice(4).map(Number);
  return lines.slice(1).map((cells) => ({
    code: cells[0],
    name: cells[1].trim(),
    values: Object.fromEntries(years.map((y, i) => [y, Number(cells[4 + i])])),
    years,
  }));
}

// Partners: "Exports, Poland, N" -> "Poland" (N = nominal value).
function partnerRanking(rows) {
  const total = rows.find((r) => /^(Exports|Imports), Total, N$/.test(r.name));
  const countries = rows
    .filter((r) => r.name.endsWith(', N') && !AGGREGATE.test(r.name))
    .map((r) => ({ ...r, label: r.name.replace(/^(Exports|Imports), /, '').replace(/, N$/, '') }));
  const out = new Map();
  const unranked = new Map(); // year -> % of total not attributed to a listed country
  for (const year of total.years) {
    const t = total.values[year];
    if (!(t > 0)) continue;
    const list = countries.filter((c) => c.values[year] > 0);
    const covered = list.reduce((a, c) => a + c.values[year], 0);
    const top = list.sort((a, b) => b.values[year] - a.values[year]).slice(0, 5);
    if (top.length < 5 || t - covered >= top[4].values[year]) {
      if (covered > 0) unranked.set(year, round(((t - covered) / t) * 100));
      continue;
    }
    out.set(year, top.map((c) => ({
      name: DISPLAY[c.label] ?? c.label,
      share: round((c.values[year] / t) * 100),
      value: round(c.values[year] * 1e6),
    })));
  }
  return { ranking: out, unranked, totals: total.values };
}

// Commodity groups for the whole USSR (not the "to socialist / capitalist
// countries" breakdowns), as % of the total.
function groupRanking(rows, totals) {
  const groups = rows
    .filter((r) => /by Commodity Groups, /.test(r.name) && !/Total/.test(r.name) && !/Socialist|Capitalist/.test(r.name))
    .map((r) => ({ ...r, label: r.name.replace(/^.*by Commodity Groups, /, '').replace(/\.$/, '') }));
  const total = rows.find((r) => /^(Exports|Imports) by Commodity Groups, Total$/.test(r.name));
  const out = new Map();
  for (const year of total.years) {
    if (total.values[year] !== 100) continue;
    const list = groups.filter((g) => g.values[year] > 0);
    if (!list.length) continue;
    const listed = list.reduce((a, g) => a + g.values[year], 0);
    const top = list.sort((a, b) => b.values[year] - a.values[year]).slice(0, 5);
    out.set(year, {
      unassigned: round(Math.max(0, 100 - listed)),
      top: top.map((g) => ({
        product: GROUP_NAMES[g.label] ?? g.label,
        share: g.values[year],
        value: totals[year] > 0 ? round(g.values[year] / 100 * totals[year] * 1e6) : null,
      })),
    });
  }
  return out;
}
const GROUP_NAMES = {
  'M&E & Means of Transport': 'Machinery, equipment & transport',
  'M&E & Means': 'Machinery, equipment & transport',
  'Fuel & Electricity': 'Fuel & electricity',
  'Metal Ores & Metal Prod': 'Metal ores & metals',
  'Non-Metallic Minerals, Clay': 'Non-metallic minerals',
  'Chem. Prod. & Rubber': 'Chemicals & rubber',
  'Wood, Paper & Pulp': 'Timber, paper & pulp',
  'Textile Mat': 'Textile raw materials',
  'Fur & Fur Materials': 'Furs',
  'Foodstuffs & Food Mat': 'Foodstuffs',
  'Ind. Goods for Public Consum': 'Consumer manufactures',
  'Ind. Goods for Public Cosum': 'Consumer manufactures',
};

const exp = partnerRanking(await table('S712'));
const imp = partnerRanking(await table('S713'));
const gExp = groupRanking(await table('S721'), exp.totals);
const gImp = groupRanking(await table('S722'), imp.totals);

await clearTradeContent('products', (src) => src.startsWith('Official Soviet'));
await clearTradeContent('partners', (src) => src.startsWith('Official Soviet'));
const years = new Set([...exp.ranking.keys(), ...imp.ranking.keys(), ...gExp.keys(), ...gImp.keys()]);
let n = 0;
for (const year of [...years].sort()) {
  const patch = { currency: 'rubles', sources: {} };
  if (exp.ranking.has(year) || imp.ranking.has(year)) {
    patch.partners = {};
    if (exp.ranking.has(year)) patch.partners.exports = exp.ranking.get(year);
    if (imp.ranking.has(year)) patch.partners.imports = imp.ranking.get(year);
    const notes = [];
    if (exp.unranked.has(year)) notes.push(`Export partners are not ranked: ${exp.unranked.get(year)}% of exports is not attributed to a named country in the official statistics, enough to change the top 5.`);
    if (imp.unranked.has(year)) notes.push(`Import partners are not ranked: ${imp.unranked.get(year)}% of imports is not attributed to a named country in the official statistics, enough to change the top 5.`);
    if (notes.length) patch.partners.note = notes.join(' ');
    patch.sources.partners = SOURCE;
  }
  if (gExp.has(year) && gImp.has(year)) {
    patch.exports = gExp.get(year).top;
    patch.imports = gImp.get(year).top;
    const ue = gExp.get(year).unassigned;
    const ui = gImp.get(year).unassigned;
    patch.sources.products = `${SOURCE}; broad Soviet commodity groups. Not assigned to a group in the source: ${ue}% of exports, ${ui}% of imports`;
  }
  await patchTradeFile(CODE, year, patch);
  n++;
}
await rebuildTradeIndex();
console.log(`  sess: ${n} USSR trade years; export partners not ranked in ${[...exp.unranked.keys()].join(', ') || 'no years'}; import partners not ranked in ${[...imp.unranked.keys()].join(', ') || 'no years'}`);

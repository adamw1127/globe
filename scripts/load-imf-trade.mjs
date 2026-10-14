// IMF International Trade in Goods statistics (formerly Direction of Trade
// Statistics), 1948 onward, via the IMF SDMX API (free, no key):
// exports (FOB) and imports (CIF) of each reporting economy by partner.
//
// Fills top export and import partners for territory-years that no other
// trade source covers (load after RICardo, Atlas and SESS). It never
// overwrites another source.
//
// Safeguards:
//  - Trade the source does not assign to a named country sits in separate
//    buckets ("other countries n.i.e.", "special categories" for military
//    goods, "<region> not specified", and any remainder of the world
//    total). A single unlisted country can hide in at most one bucket, so
//    a partner is only shown if it is larger than the largest bucket
//    (safeTop). If fewer than five qualify, a note says why.
//  - Economies outside IMF reporting (the Soviet bloc before it joined)
//    are skipped: their figures are rebuilt from partners' records and
//    miss trade inside the bloc.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, DATA_DIR, readJSON, round, pool } from './lib/util.mjs';
import { TRADE_DIR, patchTradeFile, clearTradeContent, rebuildTradeIndex, safeTop, rankingNote } from './lib/trade.mjs';
import { NON_REPORTING } from './lib/non-reporting.mjs';

const API = 'https://api.imf.org/external/sdmx/2.1/data/IMF.STA,IMTS';
const SOURCE = 'IMF International Trade in Goods (Direction of Trade) statistics';
const FIRST_YEAR = 1948;
const AGGREGATE = /^(G\d{3}|GX\d+|TX\d+)$/;
const PARTNER_BUCKETS = new Set(['TX126']); // Belgium-Luxembourg is reported as one partner

const cacheDir = path.join(CACHE_DIR, 'imf');
await fs.mkdir(cacheDir, { recursive: true });
const countries = await readJSON(path.join(DATA_DIR, 'countries.json'));

async function getJSON(url, cacheName) {
  const file = path.join(cacheDir, cacheName);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {}
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      // 404/400: the API has no series for this code (e.g. a retired economy).
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      await fs.writeFile(file, JSON.stringify(body));
      return body;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

// IMF codes -> data entity codes for the reporting territory.
function entityFor(code, year) {
  if (code === 'DEU' && year < 1991) return 'BRD'; // West Germany before reunification
  return code;
}

const struct = await getJSON('https://api.imf.org/external/sdmx/3.0/structure/dataflow/IMF.STA/IMTS/+?references=all&detail=full', 'structure.json');
const codelist = struct.data.codelists.find((c) => c.id === 'CL_IMTS_COUNTRY').codes;
const imfNames = new Map(codelist.map((c) => [c.id, c.name]));
const reporters = codelist.map((c) => c.id).filter((id) => /^[A-Z]{3}$/.test(id) && !AGGREGATE.test(id));
const HISTORICAL_NAMES = { SUN: 'Soviet Union', YUG: 'Yugoslavia', CSK: 'Czechoslovakia', DDR: 'East Germany' };
// Before reunification the IMF's "Germany" is West Germany.
const displayName = (code, year) => (code === 'DEU' && year < 1991 ? 'West Germany' : HISTORICAL_NAMES[code])
  ?? countries[code]?.name ?? imfNames.get(code)?.replace(/, The$/, '') ?? code;

// Correlates of War data is the last-resort filler (load-cow-trade.mjs runs
// after this script), so it is cleared here and rebuilt around IMF data.
await clearTradeContent('partners', (src) => src.startsWith('IMF') || src.startsWith('Correlates of War'));
// Rebuild after clearing, so years this script previously filled count as open.
const index = await rebuildTradeIndex();
const covered = (code, year) => index[code]?.partners.includes(year);

let written = 0;
let partial = 0;
let skippedNonReporting = 0;
const pending = [];
await pool(reporters, 3, async (rep) => {
  const body = await getJSON(`${API}/${rep}.XG_FOB_USD+MG_CIF_USD..A?startPeriod=${FIRST_YEAR}`, `${rep}.json`);
  if (!body?.dataSets?.[0]?.series) return;
  const st = body.structure;
  const dims = st.dimensions.series;
  const di = Object.fromEntries(dims.map((d, i) => [d.id, i]));
  const years = st.dimensions.observation[0].values.map((v) => Number(v.id));
  // byYear[year][flow] = Map(partnerCode -> value)
  const byYear = new Map();
  for (const [key, s] of Object.entries(body.dataSets[0].series)) {
    const idx = key.split(':').map(Number);
    const indicator = dims[di.INDICATOR].values[idx[di.INDICATOR]].id;
    const partner = dims[di.COUNTERPART_COUNTRY].values[idx[di.COUNTERPART_COUNTRY]].id;
    const flow = indicator === 'XG_FOB_USD' ? 'exports' : 'imports';
    for (const [oi, obs] of Object.entries(s.observations)) {
      const v = Number(obs[0]);
      if (!(v > 0)) continue;
      const y = years[Number(oi)];
      if (!byYear.has(y)) byYear.set(y, { exports: new Map(), imports: new Map() });
      byYear.get(y)[flow].set(partner, v);
    }
  }
  for (const [year, flows] of byYear) {
    const code = entityFor(rep, year);
    if (covered(code, year)) continue;
    if (NON_REPORTING[code]?.(year)) { skippedNonReporting++; continue; }
    const partners = {};
    const notes = [];
    for (const kind of ['exports', 'imports']) {
      const m = flows[kind];
      const world = m.get('G001');
      if (!world) continue;
      const list = [...m]
        .filter(([p]) => (!AGGREGATE.test(p) || PARTNER_BUCKETS.has(p)) && p !== rep)
        .map(([p, v]) => ({ name: PARTNER_BUCKETS.has(p) ? 'Belgium-Luxembourg' : displayName(p, year), value: v }))
        .sort((a, b) => b.value - a.value);
      const buckets = [...m].filter(([p]) => /^TX\d+$/.test(p) && !PARTNER_BUCKETS.has(p)).map(([, v]) => v);
      const listed = list.reduce((s, p) => s + p.value, 0) + buckets.reduce((s, v) => s + v, 0);
      const remainder = Math.max(0, world - listed);
      const hidden = Math.max(0, remainder, ...buckets);
      const top = safeTop(list, hidden);
      const note = rankingNote(kind, top.length, round(((world - list.reduce((s, p) => s + p.value, 0)) / world) * 100));
      if (note) notes.push(note);
      if (top.length) partners[kind] = top.map((p) => ({ name: p.name, share: round((p.value / world) * 100), value: round(p.value) }));
    }
    if (!partners.exports && !partners.imports) continue;
    if (notes.length) { partners.note = notes.join(' '); partial++; }
    pending.push([code, year, { partners, sources: { partners: SOURCE } }]);
  }
});
for (const [code, year, patch] of pending) {
  await patchTradeFile(code, year, patch);
  written++;
}
await rebuildTradeIndex();
console.log(`  imf trade: ${written} territory-years filled (${partial} with fewer than 5 partners ranked); skipped ${skippedNonReporting} for economies outside IMF reporting`);

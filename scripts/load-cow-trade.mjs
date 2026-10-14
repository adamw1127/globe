// Correlates of War Trade dataset v4.0 (Barbieri & Keshk), 1870-2014:
// bilateral flows and national totals in current US$ (League of Nations /
// Hicks data to 1949, IMF Direction of Trade after).
// https://correlatesofwar.org/data-sets/bilateral-trade/
//
// Fills top 5 export and import partners for territory-years that no
// other trade source covers (above all 1939-1961, between RICardo and the
// Atlas). It never overwrites another source. Two safeguards:
//  - A partner is only shown if it is larger than the territory's trade
//    not attributed to any listed partner (national total minus the sum of
//    partner flows), so no missing partner could outrank it. If fewer than
//    five qualify, a note says why.
//  - That check needs a national total the country reported itself.
//    Centrally planned economies outside the IMF did not report to it, so
//    their totals and partner flows are rebuilt from other countries'
//    records and miss trade inside the Soviet bloc. Those territory-years
//    are skipped (NON_REPORTING, from IMF membership dates).
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CACHE_DIR, cachedDownload, round, readJSON } from './lib/util.mjs';
import { parseCSV, parseCSVLine } from './lib/owid.mjs';
import { loadResolver } from './lib/entities.mjs';
import { loadCowEntity } from './lib/cow.mjs';
import { TRADE_DIR, patchTradeFile, clearTradeContent, rebuildTradeIndex, safeTop, rankingNote } from './lib/trade.mjs';
import { NON_REPORTING } from './lib/non-reporting.mjs';

const SOURCE = 'Correlates of War Trade v4.0 (League of Nations and IMF Direction of Trade data)';

const zip = await cachedDownload('https://correlatesofwar.org/wp-content/uploads/COW_Trade_4.0.zip', 'cowtrade/cow.zip');
const dir = path.join(CACHE_DIR, 'cowtrade');
execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
const base = path.join(dir, 'COW_Trade_4.0');

const { resolveDataset } = await loadResolver();
const cowEntity = await loadCowEntity(resolveDataset);
const names = new Map(); // ccode -> latest state name (for partner labels)

// National totals (US$ million).
const totals = new Map(); // `${ccode}|${year}` -> { imports, exports }
for (const r of parseCSV(await fs.readFile(path.join(base, 'National_COW_4.0.csv'), 'latin1'))) {
  totals.set(`${r.ccode}|${r.year}`, { imports: Number(r.imports), exports: Number(r.exports) });
  names.set(r.ccode, r.statename);
}

// Partner flows per reporter-year.
const flows = new Map(); // `${ccode}|${year}` -> { exp: Map(partner->v), imp: Map }
const get = (k) => {
  if (!flows.has(k)) flows.set(k, { exp: new Map(), imp: new Map() });
  return flows.get(k);
};
const rl = readline.createInterface({ input: createReadStream(path.join(base, 'Dyadic_COW_4.0.csv'), 'latin1'), crlfDelay: Infinity });
let header;
for await (const line of rl) {
  const c = parseCSVLine(line);
  if (!header) { header = c; continue; }
  const r = Object.fromEntries(header.map((h, i) => [h.trim(), c[i]]));
  const year = r.year;
  const f1 = Number(r.flow1); // imports of ccode1 from ccode2
  const f2 = Number(r.flow2); // imports of ccode2 from ccode1
  names.set(r.ccode1, r.importer1);
  names.set(r.ccode2, r.importer2);
  const a = get(`${r.ccode1}|${year}`);
  const b = get(`${r.ccode2}|${year}`);
  if (f1 > 0) { a.imp.set(r.ccode2, f1); b.exp.set(r.ccode1, f1); }
  if (f2 > 0) { b.imp.set(r.ccode1, f2); a.exp.set(r.ccode2, f2); }
}

// The remainder (national total minus partner flows) is not broken down,
// so all of it could belong to one unlisted partner.
// COW state names are not dated: 365 is Russia in every era.
function partnerName(cc, year) {
  if (cc === '365' && year >= 1922 && year <= 1991) return 'Soviet Union';
  if (cc === '260') return 'West Germany';
  if (cc === '265') return 'East Germany';
  return names.get(cc) ?? cc;
}

function ranked(partners, total, kind, year) {
  if (!(total > 0) || !partners.size) return { top: [], note: null };
  const list = [...partners].map(([cc, v]) => ({ name: partnerName(cc, year), value: v })).sort((a, b) => b.value - a.value);
  const attributed = list.reduce((s, p) => s + p.value, 0);
  const hidden = Math.max(0, total - attributed);
  const top = safeTop(list, hidden).map((p) => ({ name: p.name, share: round((p.value / Math.max(total, attributed)) * 100), value: round(p.value * 1e6) }));
  return { top, note: rankingNote(kind, top.length, round((hidden / total) * 100)) };
}

// Territory-years that already have partner data from another source.
await clearTradeContent('partners', (src) => src.startsWith('Correlates of War'));
// Rebuild after clearing, so years this script previously filled count as open.
const index = await rebuildTradeIndex();
const covered = (code, year) => index[code]?.partners.includes(year);

let written = 0;
let notReported = 0;
let unsafe = 0;
for (const [key, f] of flows) {
  const [cc, y] = key.split('|');
  const year = Number(y);
  const code = cowEntity(cc, year);
  if (!code || covered(code, year)) continue;
  if (NON_REPORTING[code]?.(year)) { notReported++; continue; }
  const t = totals.get(key) ?? {};
  const exp = ranked(f.exp, t.exports, 'exports', year);
  const imp = ranked(f.imp, t.imports, 'imports', year);
  if (!exp.top.length && !imp.top.length) { unsafe++; continue; }
  const partners = {};
  if (exp.top.length) partners.exports = exp.top;
  if (imp.top.length) partners.imports = imp.top;
  const notes = [exp.note, imp.note].filter(Boolean);
  if (notes.length) partners.note = notes.join(' ');
  await patchTradeFile(code, year, { partners, sources: { partners: SOURCE } });
  written++;
}
await rebuildTradeIndex();
console.log(`  cow trade: ${written} territory-years filled; skipped ${notReported} for economies outside IMF reporting, ${unsafe} where no partner could be ranked safely`);

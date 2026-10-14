// Jorda-Schularick-Taylor Macrohistory Database (release 6): 18 advanced
// economies, 1870-2020. https://www.macrohistory.net/database/
import path from 'node:path';
import XLSX from 'xlsx';
import { METRICS_DIR, cachedDownload, writeJSON, round, sortSeries } from './lib/util.mjs';

const URL = 'https://www.macrohistory.net/app/download/9834512569/JSTdatasetR6.xlsx';
const file = await cachedDownload(URL, 'jst.xlsx');
const rows = XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets.Sheet1);

const out = { jst_ltrate: {}, jst_stir: {}, jst_house_prices: {}, jst_bank_credit: {}, jst_public_debt: {}, jst_wage_growth: {}, banking_crisis: {} };
const set = (id, iso, year, v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return;
  (out[id][iso] ??= {})[year] = round(v);
};

const byIso = Object.groupBy(rows, (r) => r.iso);
for (const [iso, list] of Object.entries(byIso)) {
  list.sort((a, b) => a.year - b.year);
  const hp1990 = list.find((r) => r.year === 1990)?.hpnom;
  let prevWage = null;
  for (const r of list) {
    set('jst_ltrate', iso, r.year, r.ltrate);
    set('jst_stir', iso, r.year, r.stir);
    if (hp1990 && Number.isFinite(r.hpnom)) set('jst_house_prices', iso, r.year, (r.hpnom / hp1990) * 100);
    if (Number.isFinite(r.tloans) && r.gdp) set('jst_bank_credit', iso, r.year, (r.tloans / r.gdp) * 100);
    if (Number.isFinite(r.debtgdp)) set('jst_public_debt', iso, r.year, r.debtgdp * 100);
    if (Number.isFinite(r.wage) && prevWage) set('jst_wage_growth', iso, r.year, (r.wage / prevWage - 1) * 100);
    prevWage = Number.isFinite(r.wage) ? r.wage : null;
    if (r.crisisJST === 1) (out.banking_crisis[iso] ??= {})[r.year] = 'Systemic banking crisis begins';
  }
}
for (const [id, series] of Object.entries(out)) {
  await writeJSON(path.join(METRICS_DIR, `${id}.json`), sortSeries(series));
  console.log(`  ${id}: ${Object.keys(series).length} entities`);
}

// Per-territory, per-year trade files: public/data/trade/<CODE>/<year>.json
//   { exports: [{ product, share, value }], imports: [...],
//     partners: { exports: [{ name, share, value }], imports: [...] },
//     sources: { products, partners } }
// Writers merge into existing files so product and partner loaders can run
// independently.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, readJSON, writeJSON } from './util.mjs';

export const TRADE_DIR = path.join(DATA_DIR, 'trade');

export async function patchTradeFile(code, year, patch) {
  const file = path.join(TRADE_DIR, code, `${year}.json`);
  let cur = {};
  try {
    cur = await readJSON(file);
  } catch {}
  const next = { ...cur, ...patch, sources: { ...(cur.sources ?? {}), ...(patch.sources ?? {}) } };
  await writeJSON(file, next);
}

// Removes one kind of content ("products" or "partners") from every file,
// so a loader can rebuild its part from scratch.
export async function clearTradeContent(kind) {
  let dirs = [];
  try {
    dirs = await fs.readdir(TRADE_DIR);
  } catch {
    return;
  }
  for (const code of dirs) {
    const dir = path.join(TRADE_DIR, code);
    if (!(await fs.stat(dir)).isDirectory()) continue;
    for (const f of await fs.readdir(dir)) {
      const file = path.join(dir, f);
      const d = await readJSON(file);
      if (kind === 'products') {
        delete d.exports;
        delete d.imports;
        // Mock partners are generated together with mock products.
        if (d.sources?.partners === 'MOCK') { delete d.partners; delete d.sources.partners; }
      }
      if (kind === 'partners') {
        // Mock partners belong to the mock product generator; leave them.
        if (d.sources?.partners === 'MOCK') continue;
        delete d.partners;
      }
      if (d.sources) delete d.sources[kind];
      if (!d.exports && !d.partners) await fs.rm(file);
      else await writeJSON(file, d);
    }
    if (!(await fs.readdir(dir)).length) await fs.rm(dir, { recursive: true });
  }
}

// index.json: { CODE: { products: [years], partners: [years] } }
export async function rebuildTradeIndex() {
  const index = {};
  for (const code of (await fs.readdir(TRADE_DIR)).sort()) {
    const dir = path.join(TRADE_DIR, code);
    if (!(await fs.stat(dir)).isDirectory()) continue;
    const entry = { products: [], partners: [] };
    for (const f of await fs.readdir(dir)) {
      const d = await readJSON(path.join(dir, f));
      const y = Number(f.replace('.json', ''));
      if (d.exports?.length) entry.products.push(y);
      if (d.partners) entry.partners.push(y);
    }
    entry.products.sort((a, b) => a - b);
    entry.partners.sort((a, b) => a - b);
    index[code] = entry;
  }
  await writeJSON(path.join(TRADE_DIR, 'index.json'), index);
  return index;
}

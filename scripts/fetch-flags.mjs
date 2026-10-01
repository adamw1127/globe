// Downloads small PNG flags (flagcdn.com, public domain flag images) into
// public/flags/<iso2>.png so the app needs no external requests at runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, ROOT, readJSON, fetchWithRetry, pool } from './lib/util.mjs';

const countries = await readJSON(path.join(DATA_DIR, 'countries.json'));
const out = path.join(ROOT, 'public/flags');
await fs.mkdir(out, { recursive: true });
const codes = [...new Set(Object.values(countries).map((c) => c.iso2.toLowerCase()))].filter((c) => /^[a-z]{2}$/.test(c));
let ok = 0;
await pool(codes, 8, async (iso2) => {
  try {
    const buf = await fetchWithRetry(`https://flagcdn.com/w80/${iso2}.png`, { asBuffer: true, tries: 2 });
    await fs.writeFile(path.join(out, `${iso2}.png`), buf);
    ok++;
  } catch {
    console.warn(`  no flag for ${iso2}`);
  }
});
console.log(`  flags: ${ok} of ${codes.length}`);

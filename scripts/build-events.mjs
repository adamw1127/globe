// Turns scripts/data/wars.json into the "wars" metric file:
// { entityCode: { year: [war names] } }.
import path from 'node:path';
import { ROOT, METRICS_DIR, readJSON, writeJSON, sortSeries } from './lib/util.mjs';

const { wars } = await readJSON(path.join(ROOT, 'scripts/data/wars.json'));
const out = {};
for (const w of wars) {
  for (let y = Math.max(w.start, 1600); y <= w.end; y++) {
    for (const code of w.participants) ((out[code] ??= {})[y] ??= []).push(w.name);
  }
}
await writeJSON(path.join(METRICS_DIR, 'wars.json'), sortSeries(out));
console.log(`  wars: ${wars.length} conflicts, ${Object.keys(out).length} entities`);

// Shared helpers for the data scripts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CONFIG_DIR = path.join(ROOT, 'public/config');
export const DATA_DIR = path.join(ROOT, 'public/data');
export const METRICS_DIR = path.join(DATA_DIR, 'metrics');
export const CACHE_DIR = path.join(ROOT, 'scripts/.cache');

export async function readJSON(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function writeJSON(file, data, pretty = false) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
}

export async function loadRegistry() {
  return readJSON(path.join(CONFIG_DIR, 'metrics.json'));
}

// Round to 4 significant digits to keep the static files small.
export function round(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  if (v === 0) return 0;
  return Number(v.toPrecision(4));
}

export async function fetchWithRetry(url, { tries = 5, asText = false, asBuffer = false } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (asBuffer) return Buffer.from(await res.arrayBuffer());
      return asText ? await res.text() : await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

// Download once into scripts/.cache so loaders can be re-run offline.
export async function cachedDownload(url, name) {
  const file = path.join(CACHE_DIR, name);
  try {
    await fs.access(file);
  } catch {
    console.log(`  downloading ${url}`);
    const buf = await fetchWithRetry(url, { asBuffer: true });
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, buf);
  }
  return file;
}

// Merge { entity: { year: value } } into an existing metric file.
// Values already present win unless `overwrite` is set.
export async function mergeMetricFile(id, series, { overwrite = false } = {}) {
  const file = path.join(METRICS_DIR, `${id}.json`);
  let existing = {};
  try {
    existing = await readJSON(file);
  } catch {}
  for (const [code, years] of Object.entries(series)) {
    existing[code] ??= {};
    for (const [y, v] of Object.entries(years)) {
      if (v === null || v === undefined) continue;
      if (overwrite || existing[code][y] === undefined) existing[code][y] = v;
    }
  }
  await writeJSON(file, sortSeries(existing));
}

export function sortSeries(series) {
  const out = {};
  for (const code of Object.keys(series).sort()) {
    const years = series[code];
    const keys = Object.keys(years).sort((a, b) => a - b);
    if (!keys.length) continue;
    out[code] = {};
    for (const y of keys) out[code][y] = years[y];
  }
  return out;
}

export async function pool(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

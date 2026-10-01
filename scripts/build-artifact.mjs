// Builds a self-contained copy of the site for hosting as a claude.ai
// Artifact (or any static host that limits file counts): the ~20,000
// per-territory trade files are packed into a few bundles and the flags into
// one JSON of data URIs. The app reads the bundles when they exist.
//
//   node scripts/build-artifact.mjs <output dir>
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, readJSON, writeJSON } from './lib/util.mjs';

const out = path.resolve(process.argv[2] ?? path.join(ROOT, 'artifact-build'));
const PACK_BYTES = 6 * 1024 * 1024;

execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
const dist = path.join(ROOT, 'dist');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

// Page: the Artifact host supplies <html>/<head>/<body>, so write only the
// title, the inlined CSS, the root element and the module script.
const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const scriptSrc = html.match(/<script type="module"[^>]*src="([^"]+)"/)[1].replace(/^\.\//, '');
const cssHrefs = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ''));
let css = '';
for (const href of cssHrefs) css += await fs.readFile(path.join(dist, href), 'utf8');
await fs.writeFile(path.join(out, 'index.html'),
  `${title}\n<meta name="theme-color" content="#05070d">\n<style>${css}</style>\n<div id="root"></div>\n<script type="module" src="${scriptSrc}"></script>\n`);
await fs.mkdir(path.join(out, path.dirname(scriptSrc)), { recursive: true });
await fs.copyFile(path.join(dist, scriptSrc), path.join(out, scriptSrc));

// Data that is copied as is.
const copyDir = async (from, to) => {
  await fs.mkdir(to, { recursive: true });
  for (const f of await fs.readdir(from)) {
    const src = path.join(from, f);
    if ((await fs.stat(src)).isFile()) await fs.copyFile(src, path.join(to, f));
  }
};
await copyDir(path.join(dist, 'config'), path.join(out, 'config'));
await copyDir(path.join(dist, 'data/metrics'), path.join(out, 'data/metrics'));
await copyDir(path.join(dist, 'data/borders'), path.join(out, 'data/borders'));
for (const f of ['countries.json', 'entities.json', 'timeline.json']) await fs.copyFile(path.join(dist, 'data', f), path.join(out, 'data', f));
await fs.mkdir(path.join(out, 'data/trade'), { recursive: true });
await fs.copyFile(path.join(dist, 'data/trade/index.json'), path.join(out, 'data/trade/index.json'));

// Trade bundles: { CODE: { year: file } }, split into ~6 MB packs.
const tradeDir = path.join(dist, 'data/trade');
const codes = (await fs.readdir(tradeDir)).filter((c) => c !== 'index.json').sort();
const map = {};
let pack = {};
let packBytes = 0;
let packNo = 0;
const flush = async () => {
  if (!Object.keys(pack).length) return;
  await writeJSON(path.join(out, 'data/trade-packs', `${packNo}.json`), pack);
  packNo++;
  pack = {};
  packBytes = 0;
};
for (const code of codes) {
  const years = {};
  let bytes = 0;
  for (const f of await fs.readdir(path.join(tradeDir, code))) {
    const text = await fs.readFile(path.join(tradeDir, code, f), 'utf8');
    years[f.replace('.json', '')] = JSON.parse(text);
    bytes += text.length;
  }
  if (packBytes + bytes > PACK_BYTES) await flush();
  pack[code] = years;
  packBytes += bytes;
  map[code] = packNo;
}
await flush();
await writeJSON(path.join(out, 'data/trade-packs/map.json'), map);

// Flags as data URIs in one file.
const flags = {};
const flagDir = path.join(dist, 'flags');
for (const f of await fs.readdir(flagDir)) {
  flags[f.replace('.png', '')] = `data:image/png;base64,${(await fs.readFile(path.join(flagDir, f))).toString('base64')}`;
}
await writeJSON(path.join(out, 'data/flags.json'), flags);

// Summary against the host's limits.
const files = [];
const walk = async (dir) => {
  for (const f of await fs.readdir(dir)) {
    const p = path.join(dir, f);
    if ((await fs.stat(p)).isDirectory()) await walk(p);
    else files.push({ p: path.relative(out, p), size: (await fs.stat(p)).size });
  }
};
await walk(out);
const total = files.reduce((a, f) => a + f.size, 0);
const largest = files.reduce((a, f) => (f.size > a.size ? f : a));
await writeJSON(path.join(out, '..', 'artifact-files.json'), files.map((f) => f.p).filter((p) => p !== 'index.html'), true);
console.log(`artifact build: ${files.length} files, ${(total / 1e6).toFixed(1)} MB, largest ${largest.p} ${(largest.size / 1e6).toFixed(1)} MB, ${packNo} trade packs`);

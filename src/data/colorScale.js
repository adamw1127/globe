import { formatLegend } from './format.js';

// Map colors run from red (worse) to green (better), following each
// measure's `better` direction ("up" or "down"); measures with no better
// direction run red for low to green for high. Lightness also changes along
// the ramp (deep red is darker than green), so the two ends stay apart for
// readers with red-green color blindness.
export const RAMP = ['#a50026', '#d73027', '#f46d43', '#fdae61', '#d9ef8b', '#66bd63', '#1a9850'];
export const MISSING_COLOR = '#6b7280'; // territory with no figure
export const LAND_COLOR = '#2f3744'; // land no state covers on this map
export const NEUTRAL_COLOR = '#3b4a63'; // "Color by: none"

const range = (lo, hi, format) => {
  const a = formatLegend(lo, format);
  const b = formatLegend(hi, format);
  return a === b ? a : `${a} to ${b}`;
};

function quantiles(sorted, n) {
  const out = [];
  for (let i = 1; i < n; i++) out.push(sorted[Math.floor((i / n) * sorted.length)]);
  return [...new Set(out)];
}

function spread(palette, n) {
  if (n <= 1) return [palette[palette.length - 1]];
  return Array.from({ length: n }, (_, i) => palette[Math.round((i / (n - 1)) * (palette.length - 1))]);
}

// Binned scale. `breaks` (class boundaries) come from the metric's stats so
// a color means the same value in every year; without them, quantiles of
// this year's values are used.
export function buildScale({ values, breaks, min, max, format, better }) {
  let cuts = breaks;
  if (!cuts) {
    const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    cuts = quantiles(v, Math.min(RAMP.length, new Set(v).size));
    min = v[0];
    max = v[v.length - 1];
  }
  const ramp = cuts.length + 1 < RAMP.length ? spread(RAMP, cuts.length + 1) : RAMP;
  const palette = better === 'down' ? [...ramp].reverse() : ramp;
  const color = (x) => {
    const i = cuts.findIndex((c) => x < c);
    return palette[i === -1 ? cuts.length : i];
  };
  const legend = [min, ...cuts].map((lo, i, arr) => ({ color: palette[i], label: range(lo, arr[i + 1] ?? max, format) }));
  return { color, legend, better };
}

// Estimates are drawn in a washed-out version of their color.
const cache = new Map();
export function faded(hex) {
  if (!cache.has(hex)) {
    const mix = (a, b) => Math.round(a * 0.45 + b * 0.55);
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const g = [0x55, 0x5d, 0x6b];
    cache.set(hex, `#${c.map((v, i) => mix(v, g[i]).toString(16).padStart(2, '0')).join('')}`);
  }
  return cache.get(hex);
}

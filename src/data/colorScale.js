import { formatLegend } from './format.js';

// "a to b", or just "a" when both ends round to the same label.
const range = (lo, hi, format) => {
  const a = formatLegend(lo, format);
  const b = formatLegend(hi, format);
  return a === b ? a : `${a} to ${b}`;
};

export const MISSING_COLOR = '#2b3240';
const SEQUENTIAL = ['#173a5e', '#1b5a85', '#1f7aa3', '#2a9d8f', '#5bbf7a', '#a6d66a', '#f1e05a'];
const NEGATIVE = ['#b8323f', '#dc6b5b', '#f0a58b'];
const POSITIVE = ['#9fd0ea', '#4fa3d8', '#1f6fb2', '#123f7a'];

function quantiles(sorted, n) {
  const out = [];
  for (let i = 1; i < n; i++) out.push(sorted[Math.floor((i / n) * sorted.length)]);
  return [...new Set(out)];
}

// Builds a binned color scale for the values present on the map.
// Quantile bins keep skewed metrics (GDP, population) readable. When values
// straddle zero, negatives and positives get separate color ramps.
export function buildScale(values, format) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const min = v[0];
  const max = v[v.length - 1];

  if (min < 0 && max > 0) {
    const neg = v.filter((x) => x < 0);
    const pos = v.filter((x) => x >= 0);
    const negCuts = quantiles(neg, Math.min(NEGATIVE.length, new Set(neg).size));
    const posCuts = quantiles(pos, Math.min(POSITIVE.length, new Set(pos).size));
    const color = (x) => {
      if (x < 0) {
        const i = negCuts.findIndex((c) => x < c);
        return NEGATIVE[i === -1 ? negCuts.length : i];
      }
      const i = posCuts.findIndex((c) => x < c);
      return POSITIVE[i === -1 ? posCuts.length : i];
    };
    const legend = [
      ...[min, ...negCuts].map((lo, i, arr) => ({ color: NEGATIVE[i], label: range(lo, arr[i + 1] ?? 0, format) })),
      ...[0, ...posCuts].map((lo, i, arr) => ({ color: POSITIVE[i], label: range(lo, arr[i + 1] ?? max, format) })),
    ];
    return { color, legend };
  }

  // Never more bins than distinct values, so sparse years stay readable.
  const cuts = quantiles(v, Math.min(SEQUENTIAL.length, new Set(v).size));
  const palette = cuts.length + 1 < SEQUENTIAL.length ? spread(SEQUENTIAL, cuts.length + 1) : SEQUENTIAL;
  const color = (x) => {
    const i = cuts.findIndex((c) => x < c);
    return palette[i === -1 ? cuts.length : i];
  };
  const legend = [min, ...cuts].map((lo, i, arr) => ({
    color: palette[i],
    label: range(lo, arr[i + 1] ?? max, format),
  }));
  return { color, legend };
}

function spread(palette, n) {
  if (n <= 1) return [palette[palette.length - 1]];
  return Array.from({ length: n }, (_, i) => palette[Math.round((i / (n - 1)) * (palette.length - 1))]);
}

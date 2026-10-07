import { formatLegend } from './format.js';

// Small values warm and light, large values dark: pale sand through blues to
// dark green. Lightness falls steadily so order reads without hue.
export const MISSING_COLOR = '#2b3240';
const SEQUENTIAL = ['#ffd49c', '#8fd0e1', '#64b2de', '#4493d0', '#007ea2', '#00685a', '#154f2f'];
// Measures that go negative: the most negative warmest, the most positive darkest.
const NEGATIVE = ['#cd632d', '#e5955d', '#f3c898'];
const POSITIVE = ['#8cc8e0', '#4b9bcf', '#00778d', '#154f2f'];

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

// Binned color scale for the values on the map. Quantile bins keep skewed
// measures readable; never more bins than distinct values.
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
    const negPal = NEGATIVE.slice(0, negCuts.length + 1);
    const posPal = POSITIVE.slice(POSITIVE.length - posCuts.length - 1);
    const color = (x) => {
      if (x < 0) {
        const i = negCuts.findIndex((c) => x < c);
        return negPal[i === -1 ? negCuts.length : i];
      }
      const i = posCuts.findIndex((c) => x < c);
      return posPal[i === -1 ? posCuts.length : i];
    };
    const legend = [
      ...[min, ...negCuts].map((lo, i, arr) => ({ color: negPal[i], label: range(lo, arr[i + 1] ?? 0, format) })),
      ...[0, ...posCuts].map((lo, i, arr) => ({ color: posPal[i], label: range(lo, arr[i + 1] ?? max, format) })),
    ];
    return { color, legend };
  }

  const cuts = quantiles(v, Math.min(SEQUENTIAL.length, new Set(v).size));
  const palette = cuts.length + 1 < SEQUENTIAL.length ? spread(SEQUENTIAL, cuts.length + 1) : SEQUENTIAL;
  const color = (x) => {
    const i = cuts.findIndex((c) => x < c);
    return palette[i === -1 ? cuts.length : i];
  };
  const legend = [min, ...cuts].map((lo, i, arr) => ({ color: palette[i], label: range(lo, arr[i + 1] ?? max, format) }));
  return { color, legend };
}

// Estimates for missing values (rules in scripts/lib/estimates.mjs) plus the
// per-metric statistics they and the percentiles use.
import { fetchJSON } from './fetchJSON.js';
import { formatValue } from './format.js';

export { estimate, notApplicable, regionOf, peerRange, interpolate } from '../../scripts/lib/estimates.mjs';

// { breaks, min, max, n: { year: count }, years: { stop: { W: [n, p20, p50, p80], region: [...] } } }
export function loadStats(metricId) {
  return fetchJSON(`data/stats/${metricId}.json`);
}

// One-line description of how an estimate was made.
export function estimateText(est, metric, countries) {
  if (!est) return '';
  if (est.kind === 'interpolated') return `Between the ${est.from} and ${est.to} figures`;
  if (est.kind === 'proxy') return `${countries[est.proxy]?.name ?? est.proxy}'s figure${est.year ? ` (${est.year})` : ''}, today's borders`;
  if (est.kind === 'peers') {
    const range = `${formatValue(est.low, metric.format)} to ${formatValue(est.high, metric.format)}`;
    return est.scope === 'region'
      ? `No record. ${range} is the typical range (middle 60%) of ${est.n} ${est.region} countries that year; the real figure could lie outside it`
      : `No record. ${range} is the typical range (middle 60%) of the ${est.n} countries with records that year; the real figure could lie outside it`;
  }
  return '';
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

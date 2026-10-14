// Estimates for missing values, shared by the data scripts and the app
// (src/data/estimates.js re-exports it). Every estimate is computed from
// real figures in the data files and says how it was made:
//  - interpolated: between two real values of the same territory, at most
//    `metric.estimate.interpolate` years apart (growth-rate interpolation
//    when `log` is set, for levels such as population)
//  - proxy: a historical state's present-day successor, for rates and
//    per-person measures only (`proxy`)
//  - peers: the typical range (20th to 80th percentile) of countries in the
//    same region that year, or of all countries when the region has fewer
//    than three (`peers`)
// Nothing is ever invented: when none of these apply, the value is unknown.
import { windowFor, valueAt } from './timeline.mjs';

export const PEER_MIN_REGION = 3;
export const PEER_MIN_WORLD = 5;

// World Bank region of a country; a historical state takes its successor's.
export function regionOf(code, countries, historical) {
  if (countries[code]) return countries[code].region ?? null;
  const h = historical[code];
  if (!h) return null;
  return countries[h.proxy]?.region ?? countries[h.successors?.[0]]?.region ?? null;
}

export function interpolate(years, stop, eras, maxGap, log) {
  if (!maxGap || !years) return null;
  const [from, to] = windowFor(stop, eras);
  let prev;
  let next;
  for (const k of Object.keys(years)) {
    const y = Number(k);
    if (typeof years[k] !== 'number') continue;
    if (y < from && (prev === undefined || y > prev)) prev = y;
    if (y > to && (next === undefined || y < next)) next = y;
  }
  if (prev === undefined || next === undefined || next - prev > maxGap) return null;
  const a = years[prev];
  const b = years[next];
  const t = (stop - prev) / (next - prev);
  const value = log && a > 0 && b > 0 ? a * (b / a) ** t : a + (b - a) * t;
  return { kind: 'interpolated', value, from: prev, to: next };
}

// stats: { years: { [stop]: { W: [n, p20, p50, p80], [region]: [...] } } }
export function peerRange(stats, stop, region) {
  const y = stats?.years?.[stop];
  if (!y) return null;
  const r = region ? y[region] : null;
  if (r && r[0] >= PEER_MIN_REGION) return { kind: 'peers', scope: 'region', region, n: r[0], low: r[1], value: r[2], high: r[3] };
  const w = y.W;
  if (w && w[0] >= PEER_MIN_WORLD) return { kind: 'peers', scope: 'world', n: w[0], low: w[1], value: w[2], high: w[3] };
  return null;
}

// Best estimate for one territory, or null. `seriesOf(code)` returns that
// code's { year: value } for this metric.
export function estimate({ metric, code, stop, eras, seriesOf, stats, countries, historical }) {
  const e = metric.estimate;
  if (!e || !code || code.startsWith('PART:')) return null;
  const interp = interpolate(seriesOf(code), stop, eras, e.interpolate, e.log);
  if (interp) return interp;
  const h = historical[code];
  if (e.proxy && h?.proxy) {
    const hit = valueAt(seriesOf(h.proxy), stop, eras);
    if (hit && typeof hit.value === 'number') return { kind: 'proxy', value: hit.value, year: hit.year, proxy: h.proxy };
  }
  if (e.peers) return peerRange(stats, stop, regionOf(code, countries, historical));
  return null;
}

// Why a measure has no value at all in a year, when it did not exist yet.
export function notApplicable(metric, stop) {
  return metric.notApplicable?.find((r) => stop < r.before)?.reason ?? null;
}

// Quantile of a sorted array (linear between ranks).
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

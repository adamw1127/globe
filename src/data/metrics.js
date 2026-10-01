import { fetchJSON } from './fetchJSON.js';

// Series for one metric: { entityCode: { year: value } }.
export function loadMetric(id) {
  return fetchJSON(`data/metrics/${id}.json`).then((d) => d ?? {});
}

// Returns { value, code } from the first code that has a value for the
// year, or null. `codes` comes from dataCodes() in entities.js.
export function valueFor(series, codes, year) {
  for (const code of codes) {
    const v = series?.[code]?.[year];
    if (v !== undefined && v !== null) return { value: v, code };
  }
  return null;
}

// Full time series for the first code that has any data, as chart points.
export function seriesFor(series, codes) {
  for (const code of codes) {
    const s = series?.[code];
    if (s && Object.keys(s).length) {
      return { code, points: Object.entries(s).map(([y, v]) => ({ year: Number(y), value: v })) };
    }
  }
  return null;
}

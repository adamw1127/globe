import { fetchJSON } from './fetchJSON.js';
import { valueAt } from './years.js';

// Series for one metric: { entityCode: { year: value } } (map coloring).
export function loadMetric(id) {
  return fetchJSON(`data/metrics/${id}.json`).then((d) => d ?? {});
}

// Every metric's series for one entity: { metricId: { year: value } }.
export function loadEntity(code) {
  return fetchJSON(`data/entity/${code}.json`).then((d) => d ?? {});
}

// The first code (entity, then proxy) with a value at this stop:
// { value, code, year, carried }. `year` is the year the value is from,
// which differs from the stop for benchmark spans and latest-value fills.
export function valueFor(seriesByCode, codes, stop, eras, metric) {
  for (const code of codes) {
    const hit = valueAt(seriesByCode(code), stop, eras, { carry: metric.carryForward !== false && metric.format !== 'events' });
    if (hit) return { ...hit, code };
  }
  return null;
}

export function pointsOf(years) {
  return years ? Object.entries(years).map(([y, v]) => ({ year: Number(y), value: v })) : [];
}

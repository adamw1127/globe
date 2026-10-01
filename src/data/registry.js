import { fetchJSON } from './fetchJSON.js';

// Loads every config file the UI is rendered from.
export async function loadAppConfig() {
  const [metrics, categories, eras, timeline, entities, countries, tradeIndex] = await Promise.all([
    fetchJSON('config/metrics.json'),
    fetchJSON('config/categories.json'),
    fetchJSON('config/eras.json'),
    fetchJSON('data/timeline.json'),
    fetchJSON('data/entities.json'),
    fetchJSON('data/countries.json'),
    fetchJSON('data/trade/index.json'),
  ]);
  const metricList = [...metrics.metrics].sort((a, b) => a.priority - b.priority);
  return {
    metrics: metricList,
    metricsById: Object.fromEntries(metricList.map((m) => [m.id, m])),
    categories: categories.categories,
    eras,
    timeline,
    entities,
    countries,
    tradeIndex: tradeIndex ?? {},
  };
}

export const isNumeric = (m) => m.format !== 'label' && m.format !== 'events';

// Metrics whose values come from the map itself rather than a data file.
export const isMapDerived = (m) => m.loader?.type === 'borders';

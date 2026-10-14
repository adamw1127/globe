// Notable events for one territory over a span of years, drawn only from
// the datasets: wars, regime changes, banking crises, very high inflation,
// deep recessions, and the founding or end of historical states.
const INFLATION_HIGH = 40; // % per year
const RECESSION_DEEP = -8; // % GDP growth

export function dataEvents({ series, entity, from, to, metricsById }) {
  const out = [];
  const add = (year, kind, text, metricId) => out.push({ year, kind, text, source: metricsById[metricId]?.source });

  // Wars: each listed once, in the first year it appears in the span.
  const wars = series('wars') ?? {};
  const seen = new Set();
  for (let y = from; y <= to; y++) {
    for (const name of wars[y] ?? []) {
      if (seen.has(name)) continue;
      seen.add(name);
      const began = !(wars[y - 1] ?? []).includes(name);
      add(y, 'war', began ? `${name} begins` : `${name} (ongoing)`, 'wars');
    }
  }

  const regime = series('regime_type') ?? {};
  for (let y = from; y <= to; y++) {
    const now = regime[y];
    const before = regime[y - 1];
    if (now && before && now !== before) add(y, 'politics', `Regime type changes: ${before} to ${now}`, 'regime_type');
  }

  const crisis = series('banking_crisis') ?? {};
  for (let y = from; y <= to; y++) if (crisis[y]) add(y, 'economy', 'Systemic banking crisis begins', 'banking_crisis');

  const inflation = series('inflation') ?? {};
  let peak = null;
  for (let y = from; y <= to; y++) {
    const v = inflation[y];
    if (v >= INFLATION_HIGH && (!peak || v > peak.v)) peak = { y, v };
  }
  if (peak) add(peak.y, 'economy', `Inflation ${from === to ? 'reaches' : 'peaks at'} ${Math.round(peak.v).toLocaleString('en-US')}%`, 'inflation');

  const growth = series('gdp_growth') ?? {};
  let trough = null;
  for (let y = from; y <= to; y++) {
    const v = growth[y];
    if (v <= RECESSION_DEEP && (!trough || v < trough.v)) trough = { y, v };
  }
  if (trough) add(trough.y, 'economy', `Economy shrinks ${Math.abs(trough.v).toFixed(1)}%`, 'gdp_growth');

  if (entity?.kind === 'historical') {
    if (entity.from >= from && entity.from <= to) out.push({ year: entity.from, kind: 'politics', text: `${entity.name} established`, source: 'entities.json' });
    if (entity.to >= from && entity.to <= to) out.push({ year: entity.to, kind: 'politics', text: `${entity.name} ends`, source: 'entities.json' });
  }
  return out.sort((a, b) => a.year - b.year);
}

import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import GlobeView from './components/GlobeView.jsx';
import Timeline from './components/Timeline.jsx';
import TopBar from './components/TopBar.jsx';
import DataPanel from './components/DataPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import { loadAppConfig } from './data/registry.js';
import { loadBorderIndex, loadBorders, loadLand, mapYearFor, isYearlyMap } from './data/borders.js';
import { loadMetric, loadEntity } from './data/metrics.js';
import { valueAt, nearestStop } from './data/years.js';
import { describeEntity, dataCodes } from './data/entities.js';
import { buildScale, faded, MISSING_COLOR, LAND_COLOR, NEUTRAL_COLOR } from './data/colorScale.js';
import { formatValue } from './data/format.js';
import { estimate, notApplicable, peerRange, loadStats, ordinal } from './data/estimates.js';

// The full chart (and its charting library) loads only when first opened.
const BigChart = lazy(() => import('./components/BigChart.jsx'));

const DEFAULT_COLOR_BY = 'population';
const featureKey = (f) => f.properties.ENTITY ?? `name:${f.properties.NAME}`;

// View state lives in the URL hash (#year=1914&color=gdp&sel=FRA).
function readHash() {
  const p = new URLSearchParams(window.location.hash.slice(1));
  return { year: Number(p.get('year')) || null, color: p.get('color'), sel: p.get('sel') };
}
function writeHash({ year, color, sel }) {
  const p = new URLSearchParams();
  if (year) p.set('year', year);
  if (color) p.set('color', color);
  if (sel) p.set('sel', sel);
  try {
    window.history.replaceState(null, '', `#${p}`);
  } catch {
    // Some hosts do not allow changing the URL; the view still works.
  }
}

function useMediaQuery(query) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [borderIndex, setBorderIndex] = useState(null);
  const [year, setYear] = useState(null);
  const [features, setFeatures] = useState([]);
  const [land, setLand] = useState([]);
  const [colorStats, setColorStats] = useState(null);
  const [stats, setStats] = useState({});
  const [fixedScale, setFixedScale] = useState(true);
  const [colorBy, setColorBy] = useState(() => {
    const c = readHash().color;
    return c === 'none' ? null : c || DEFAULT_COLOR_BY;
  });
  const [colorSeries, setColorSeries] = useState(null);
  const [selection, setSelection] = useState(() => {
    const sel = readHash().sel;
    return sel && !sel.startsWith('name:') ? { key: sel, name: null, entity: sel, ruler: null, fromMap: false, locate: true } : null;
  });
  const [history, setHistory] = useState([]);
  const [bundles, setBundles] = useState({});
  const [flyTo, setFlyTo] = useState(null);
  const [chart, setChart] = useState(null);
  const [rightOpen, setRightOpen] = useState(true);
  const [sheet, setSheet] = useState(null); // mobile: 'data' | 'events' | 'ask' | null
  const [error, setError] = useState(null);
  const wide = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    Promise.all([loadAppConfig(), loadBorderIndex()])
      .then(([cfg, idx]) => {
        setConfig(cfg);
        setBorderIndex(idx);
        const want = readHash().year;
        setYear(want ? nearestStop(cfg.timeline.stops, want) : cfg.timeline.maxYear);
        if (readHash().color && readHash().color !== 'none' && !cfg.metricsById[readHash().color]) setColorBy(DEFAULT_COLOR_BY);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Stops the slider may land on for the current measure: none in which the
  // whole globe would be blank (the "slider blocker").
  const allowed = useMemo(() => {
    if (!config) return [];
    const { stops, colorableFrom = {}, blankStops = {} } = config.timeline;
    if (!colorBy) return stops;
    const from = colorableFrom[colorBy] ?? stops[0];
    const blank = new Set(blankStops[colorBy] ?? []);
    const list = stops.filter((s) => s >= from && !blank.has(s));
    return list.length ? list : stops;
  }, [config, colorBy]);
  // The year shown: the chosen year, moved to the nearest allowed stop.
  const stop = year && allowed.length ? (allowed.includes(year) ? year : nearestStop(allowed, year)) : null;
  // The slider and year label follow `stop` at once; the globe and panels
  // follow `shown`, which React lets lag behind while the slider is dragged
  // fast, so dragging never waits for the map.
  const shown = useDeferredValue(stop);

  const mapYear = borderIndex && shown ? mapYearFor(borderIndex, shown) : null;

  useEffect(() => {
    if (!borderIndex) return;
    loadLand(borderIndex).then(setLand);
  }, [borderIndex]);

  useEffect(() => {
    if (!mapYear) return;
    let alive = true;
    loadBorders(borderIndex, mapYear).then((f) => {
      if (!alive) return;
      setFeatures(f);
      // Warm the neighbouring maps so stepping through years does not stall.
      for (const y of [shown - 1, shown + 1]) loadBorders(borderIndex, mapYearFor(borderIndex, y));
    });
    return () => {
      alive = false;
    };
  }, [mapYear, borderIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!colorBy) return;
    let alive = true;
    Promise.all([loadMetric(colorBy), loadStats(colorBy)]).then(([s, st]) => {
      if (!alive) return;
      setColorSeries({ id: colorBy, series: s });
      setColorStats(st);
    });
    return () => {
      alive = false;
    };
  }, [colorBy]);

  // Statistics of every metric (percentiles, peer ranges) for the panels,
  // loaded once on the first selection.
  const wantStats = Boolean(selection);
  useEffect(() => {
    if (!wantStats || !config || Object.keys(stats).length) return;
    const ids = config.metrics.filter((m) => m.estimate).map((m) => m.id);
    Promise.all(ids.map((id) => loadStats(id))).then((list) => setStats(Object.fromEntries(ids.map((id, i) => [id, list[i] ?? null]))));
  }, [wantStats, config]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stop) writeHash({ year: stop, color: colorBy ?? 'none', sel: selection?.key });
  }, [stop, colorBy, selection?.key]);

  // Per-territory bundles (every measure for one code) for the panels.
  const selEntity = useMemo(() => (config && selection ? describeEntity(selection.entity, config, selection.name) : null), [config, selection]);
  const selCodesKey = selEntity ? dataCodes(selEntity).join() : '';
  useEffect(() => {
    for (const code of selCodesKey ? selCodesKey.split(',') : []) {
      if (code in bundles) continue;
      setBundles((b) => (code in b ? b : { ...b, [code]: undefined }));
      loadEntity(code).then((data) => setBundles((b) => ({ ...b, [code]: data })));
    }
  }, [selCodesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selection's map details (name, ruler) in sync with the map, and
  // fly to selections made from search, rankings or the URL.
  useEffect(() => {
    if (!selection) return;
    const match = features.find((f) => featureKey(f) === selection.key);
    if (!match) return;
    const p = match.properties;
    if (selection.locate || (selection.fromMap && p.RULER !== selection.ruler)) {
      if (selection.locate) setFlyTo({ ...centerOf(match), at: Date.now() });
      setSelection((s) => ({ ...s, name: p.NAME, ruler: p.RULER, fromMap: true, locate: false, notOnMap: null }));
    }
  }, [features, selection]);

  // Choropleth. Recorded values use each territory's own data (a series
  // that has ended shows its latest value for up to 10 years); territories
  // without one get an estimate where the metric allows it, drawn faded.
  const choropleth = useMemo(() => {
    const empty = { valueOf: () => null, scale: null, count: 0, carried: 0, estimated: 0, ranked: [] };
    if (!config || !colorSeries || colorSeries.id !== colorBy || !shown) return empty;
    const metric = config.metricsById[colorBy];
    const carry = metric.carryForward !== false;
    const cells = new Map();
    let carried = 0;
    let estimated = 0;
    const na = notApplicable(metric, shown);
    const seriesOf = (c) => colorSeries.series[c];
    for (const f of features) {
      const code = f.properties.ENTITY;
      if (!code || code.startsWith('PART:')) {
        // Territories with no data entity of their own (local polities, parts
        // of later states): the typical range of their region, if any.
        const est = !na && metric.estimate?.peers && f.properties.REGION ? peerRange(colorStats, shown, f.properties.REGION) : null;
        if (est) {
          cells.set(featureKey(f), { kind: 'est', value: est.value, est });
          estimated++;
        }
        continue;
      }
      if (cells.has(code)) continue;
      const hit = valueAt(colorSeries.series[code], shown, config.eras, { carry });
      if (hit && typeof hit.value === 'number') {
        cells.set(code, { kind: 'real', value: hit.value, year: hit.year, carried: hit.carried, name: config.countries[code]?.name ?? config.entities.historical[code]?.name ?? f.properties.NAME });
        if (hit.carried) carried++;
        continue;
      }
      if (na) {
        cells.set(code, { kind: 'na', reason: na });
        continue;
      }
      const est = estimate({ metric, code, stop: shown, eras: config.eras, seriesOf, stats: colorStats, countries: config.countries, historical: config.entities.historical });
      if (est) {
        cells.set(code, { kind: 'est', value: est.value, est });
        estimated++;
      }
    }
    const real = [...cells].filter(([, c]) => c.kind === 'real');
    const scale = fixedScale && colorStats?.breaks?.length
      ? buildScale({ breaks: colorStats.breaks, min: colorStats.min, max: colorStats.max, format: metric.format, better: metric.better })
      : buildScale({ values: real.map(([, c]) => c.value), format: metric.format, better: metric.better });
    const ranked = real.map(([code, c]) => ({ code, value: c.value, name: c.name })).sort((a, b) => b.value - a.value);
    // Percentile of each recorded value among the territories on the map.
    const sorted = ranked.map((r) => r.value).sort((a, b) => a - b);
    for (const [, c] of real) {
      let below = 0;
      let equal = 0;
      for (const x of sorted) {
        if (x < c.value) below++;
        else if (x === c.value) equal++;
      }
      c.pct = Math.round((100 * (below + equal / 2)) / sorted.length);
    }
    return { valueOf: (f) => cells.get(featureKey(f)) ?? null, scale, count: real.length, carried, estimated, ranked, metric };
  }, [config, colorSeries, colorStats, colorBy, features, shown, fixedScale]);

  const colorOf = useCallback(
    (f) => {
      if (f.properties.LAND) return LAND_COLOR;
      if (!colorBy) return NEUTRAL_COLOR;
      const c = choropleth.valueOf(f);
      if (!c || c.kind === 'na' || !choropleth.scale) return MISSING_COLOR;
      const color = choropleth.scale.color(c.value);
      return c.kind === 'est' ? faded(color) : color;
    },
    [choropleth, colorBy],
  );

  const labelOf = useCallback(
    (f) => {
      const p = f.properties;
      const box = (inner) => `<div style="max-width:260px;background:rgba(10,15,26,.94);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 9px;color:#e5e7eb;font:13px Inter,system-ui,sans-serif">${inner}</div>`;
      if (p.LAND) return box('<span style="color:#94a3b8;font-size:12px">Land not covered by any state on this map</span>');
      const metric = config?.metricsById[colorBy];
      const c = choropleth.valueOf(f);
      const entity = config ? describeEntity(p.ENTITY, config, p.NAME) : null;
      const small = (t, color = '#94a3b8') => `<div style="color:${color};font-size:11px">${t}</div>`;
      const sub = entity && entity.name !== p.NAME ? small(escape(entity.name)) : '';
      const ruler = p.RULER ? small(`Ruled by ${escape(p.RULER)}`, '#fbbf24') : '';
      let val = '';
      if (metric) {
        const name = escape(metric.name);
        if (!c) val = `${name}: <b>no figure</b>`;
        else if (c.kind === 'na') val = `${name}: <b>not applicable</b>${small(escape(c.reason))}`;
        else if (c.kind === 'est') {
          const v = c.est.kind === 'peers' ? `${formatValue(c.est.low, metric.format)} to ${formatValue(c.est.high, metric.format)}` : `≈ ${formatValue(c.value, metric.format)}`;
          val = `${name}: <b>${escape(v)}</b> <span style="color:#c4b5fd;font-size:11px">estimate</span>`;
        } else {
          val = `${name}: <b>${escape(formatValue(c.value, metric.format))}</b>${c.year !== shown ? ` <span style="color:#fcd34d;font-size:11px">(${c.year})</span>` : ''}`;
          val += small(`${ordinal(c.pct)} percentile of ${choropleth.count} on the map`);
        }
        val = `<div style="margin-top:2px;font-size:12px">${val}</div>`;
      }
      return box(`<b>${escape(p.NAME)}</b>${sub}${ruler}${val}`);
    },
    [choropleth, colorBy, config, shown],
  );

  const select = useCallback((next) => {
    setSelection(next);
    setHistory([]);
    if (next) setSheet('data');
  }, []);

  const onGlobeSelect = useCallback(
    (f, coords) => {
      if (!f || f.properties.LAND) return select(null);
      const p = f.properties;
      select({ key: featureKey(f), name: p.NAME, entity: p.ENTITY, ruler: p.RULER, fromMap: true });
      if (coords) setFlyTo({ lat: coords.lat, lng: coords.lng, at: Date.now() });
    },
    [select],
  );

  // From search or rankings: a feature on this map, or an entity code.
  const onPick = useCallback(
    (item) => {
      const f = item.feature ?? features.find((x) => x.properties.ENTITY && x.properties.ENTITY === item.code);
      if (f) {
        const p = f.properties;
        select({ key: featureKey(f), name: p.NAME, entity: p.ENTITY, ruler: p.RULER, fromMap: true });
        setFlyTo({ ...centerOf(f), at: Date.now() });
        return;
      }
      if (!item.code) return;
      // A historical state not on this year's map: jump into its lifetime.
      const h = config.entities.historical[item.code];
      if (h && (stop < (h.from ?? -Infinity) || stop > (h.to ?? Infinity))) {
        setYear(nearestStop(allowed, stop < h.from ? h.from : h.to));
        select({ key: item.code, name: null, entity: item.code, ruler: null, fromMap: false, locate: true });
        return;
      }
      // A present-day country that was part of something else that year.
      const parent = features.find((x) => {
        const e = x.properties.ENTITY;
        return e === `PART:${item.code}` || config.entities.historical[e]?.successors?.includes(item.code);
      });
      const parentName = parent && (config.entities.historical[parent.properties.ENTITY]?.name ?? parent.properties.NAME);
      select({ key: item.code, name: null, entity: item.code, ruler: null, fromMap: false, locate: true, notOnMap: { parentKey: parent ? featureKey(parent) : null, parentName } });
    },
    [features, config, stop, allowed, select],
  );

  const onShowParent = useCallback(() => {
    const f = features.find((x) => featureKey(x) === selection?.notOnMap?.parentKey);
    if (f) onGlobeSelect(f, centerOf(f));
  }, [features, selection, onGlobeSelect]);

  const onPickSuccessor = useCallback(
    (iso3, fromName) => {
      setHistory((h) => [...h, selection]);
      setSelection({ key: iso3, name: null, entity: iso3, ruler: null, fromMap: false, viaSuccessorOf: fromName, locate: true });
    },
    [selection],
  );
  const onBack = useCallback(() => {
    if (!history.length) return;
    setSelection({ ...history[history.length - 1], locate: true });
    setHistory(history.slice(0, -1));
  }, [history]);

  const openChart = useCallback((metric, points, entityName) => setChart({ metric, points, entityName }), []);

  if (error) return <div className="grid h-full place-items-center p-6 text-rose-300">Could not load data: {error}</div>;
  if (!config || !stop || !borderIndex) return <div className="grid h-full place-items-center text-sm text-slate-400">Loading globe…</div>;

  const metric = config.metricsById[colorBy];
  const skipped = metric ? runs(config.timeline.blankStops?.[colorBy] ?? []) : [];
  const blockedLabel = metric && (allowed[0] > config.timeline.stops[0] || skipped.length)
    ? `${allowed[0] > config.timeline.stops[0] ? 'Shaded years have' : 'Skipped years have'} no ${metric.name.toLowerCase()} figures anywhere on the map${skipped.length ? ` (skips ${skipped.join(', ')})` : ''}.`
    : null;
  const mapIsYearly = isYearlyMap(borderIndex, mapYear);

  const dataPanel = selection && (
    <DataPanel
      key={selection.key}
      config={config}
      bundles={bundles}
      stats={stats}
      selection={selection}
      stop={shown}
      mapYear={mapYear}
      mapIsYearly={mapIsYearly}
      onShowParent={onShowParent}
      onClose={() => select(null)}
      onPickSuccessor={onPickSuccessor}
      onBack={history.length ? onBack : null}
      onOpenChart={openChart}
      embedded={!wide}
    />
  );
  const timeline = (
    <Timeline stops={config.timeline.stops} allowed={allowed} year={stop} onChange={setYear} eras={config.eras} mapLabel={mapIsYearly ? `Borders as of ${shown}` : `Borders: ${mapYear} map${mapYear !== stop ? ' (latest before this year)' : ''}`} blockedLabel={blockedLabel} />
  );
  const topBar = (
    <TopBar config={config} features={features} colorBy={colorBy} onColorBy={setColorBy} choropleth={choropleth} stop={shown} onPick={onPick} compact={!wide} fixedScale={fixedScale} onFixedScale={setFixedScale} />
  );
  const globe = (
    <GlobeView features={features} land={land} colorOf={colorOf} labelOf={labelOf} selectedKey={selection?.key} onSelect={onGlobeSelect} featureKey={featureKey} flyTo={flyTo} />
  );

  if (wide) {
    const left = selection ? 'left-[392px]' : 'left-3';
    const right = rightOpen ? 'right-[372px]' : 'right-3';
    return (
      <div className="relative h-full w-full bg-[radial-gradient(ellipse_at_center,#0c1426_0%,#05070d_70%)]">
        {/* The globe sits between the panels so the selection stays in view. */}
        <div className={`absolute inset-y-0 transition-[left,right] duration-300 ${selection ? 'left-[384px]' : 'left-0'} ${rightOpen ? 'right-[364px]' : 'right-0'}`}>{globe}</div>
        {selection && (
          <aside aria-label="Territory data" className="absolute inset-y-3 left-3 z-30 flex w-[372px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-md">
            {dataPanel}
          </aside>
        )}
        {rightOpen ? (
          <aside aria-label="Events and questions" className="absolute inset-y-3 right-3 z-30 flex w-[352px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-md">
            <button type="button" onClick={() => setRightOpen(false)} aria-label="Hide events and chat" className="absolute top-2.5 right-2.5 z-10 grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white">
              ›
            </button>
            <RightPanel config={config} selection={selection} bundles={bundles} stop={shown} colorBy={colorBy} />
          </aside>
        ) : (
          <button type="button" onClick={() => setRightOpen(true)} className="absolute top-3 right-3 z-30 rounded-xl border border-white/10 bg-ink-900/90 px-3 py-2 text-[12.5px] text-slate-200 shadow-xl hover:bg-ink-800">
            ‹ Events & Ask
          </button>
        )}
        <div className={`pointer-events-none absolute top-3 z-20 ${left} ${right} ${rightOpen ? '' : 'pr-36'}`}>
          <div className="mx-auto max-w-2xl">
            <div className="pointer-events-auto mb-2">
              <h1 className="text-sm font-semibold tracking-tight text-white">Economic Globe <span className="font-normal text-slate-500">· 1600 to {config.timeline.maxYear}</span></h1>
            </div>
            {topBar}
          </div>
        </div>
        <div className={`pointer-events-none absolute bottom-3 z-20 ${left} ${right}`}>
          <div className="pointer-events-auto mx-auto max-w-2xl">{timeline}</div>
        </div>
        {chart && (
          <Suspense fallback={null}>
            <BigChart {...chart} year={shown} onClose={() => setChart(null)} />
          </Suspense>
        )}
      </div>
    );
  }

  // Phones and tablets: top bar, timeline, and a bottom sheet with tabs.
  const tabs = [
    ['data', 'Data'],
    ['events', 'Events'],
    ['ask', 'Ask'],
  ];
  return (
    <div className="relative flex h-full w-full flex-col bg-[radial-gradient(ellipse_at_center,#0c1426_0%,#05070d_70%)]">
      <div className="relative min-h-0 flex-1">
        {globe}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2">{topBar}</div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-2">
          <div className="pointer-events-auto">{timeline}</div>
        </div>
      </div>
      {sheet && (
        <div className="flex h-[46vh] shrink-0 flex-col overflow-hidden border-t border-white/10 bg-ink-900">
          {sheet === 'data' &&
            (dataPanel || <p className="p-4 text-[13px] text-slate-400">Tap a territory on the globe, or search for one, to see its data.</p>)}
          {sheet === 'events' && <RightPanel config={config} selection={selection} bundles={bundles} stop={shown} colorBy={colorBy} embedded show="events" />}
          {sheet === 'ask' && <RightPanel config={config} selection={selection} bundles={bundles} stop={shown} colorBy={colorBy} embedded show="chat" />}
        </div>
      )}
      <nav aria-label="Panels" className="flex shrink-0 border-t border-white/10 bg-ink-900 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSheet((s) => (s === id ? null : id))}
            aria-pressed={sheet === id}
            className={`flex-1 py-2.5 text-[13px] ${sheet === id ? 'font-semibold text-sky-300' : 'text-slate-400'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {chart && (
        <Suspense fallback={null}>
          <BigChart {...chart} year={shown} onClose={() => setChart(null)} />
        </Suspense>
      )}
    </div>
  );
}

// Rough center of a feature: the bounding-box center of its largest ring.
function centerOf(f) {
  const g = f.geometry;
  const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a));
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return { lng: (Math.min(...lngs) + Math.max(...lngs)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 };
}

// [1949, 1950, 1951, 1960] -> ['1949 to 1951', '1960']
function runs(years) {
  const out = [];
  for (let i = 0; i < years.length; i++) {
    let j = i;
    while (j + 1 < years.length && years[j + 1] === years[j] + 1) j++;
    out.push(i === j ? `${years[i]}` : `${years[i]} to ${years[j]}`);
    i = j;
  }
  return out;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

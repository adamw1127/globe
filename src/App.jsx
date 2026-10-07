import { useCallback, useEffect, useMemo, useState } from 'react';
import GlobeView from './components/GlobeView.jsx';
import Timeline from './components/Timeline.jsx';
import TopBar from './components/TopBar.jsx';
import DataPanel from './components/DataPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import BigChart from './components/BigChart.jsx';
import { loadAppConfig } from './data/registry.js';
import { loadBorderIndex, loadSnapshot, nearestSnapshot } from './data/borders.js';
import { loadMetric, loadEntity } from './data/metrics.js';
import { valueAt, nearestStop } from './data/years.js';
import { describeEntity, dataCodes } from './data/entities.js';
import { buildScale, MISSING_COLOR } from './data/colorScale.js';
import { formatValue } from './data/format.js';

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

  const snapshotYear = borderIndex && stop ? nearestSnapshot(borderIndex.snapshots, stop) : null;

  useEffect(() => {
    if (!snapshotYear) return;
    let alive = true;
    loadSnapshot(snapshotYear).then((f) => {
      if (!alive) return;
      setFeatures(f);
      // Warm the neighbouring maps so scrubbing the slider does not stall.
      const list = borderIndex.snapshots;
      const i = list.indexOf(snapshotYear);
      for (const s of [list[i - 1], list[i + 1]]) if (s) loadSnapshot(s);
    });
    return () => {
      alive = false;
    };
  }, [snapshotYear, borderIndex]);

  useEffect(() => {
    if (!colorBy) return;
    let alive = true;
    loadMetric(colorBy).then((s) => alive && setColorSeries({ id: colorBy, series: s }));
    return () => {
      alive = false;
    };
  }, [colorBy]);

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
      setSelection((s) => ({ ...s, name: p.NAME, ruler: p.RULER, fromMap: true, locate: false }));
    }
  }, [features, selection]);

  // Choropleth: each territory's own data only, never a proxy, so the map
  // never paints a successor's numbers onto an older state. A series that
  // has ended shows its latest value for up to 10 years.
  const choropleth = useMemo(() => {
    const empty = { valueOf: () => null, scale: null, count: 0, carried: 0, ranked: [] };
    if (!config || !colorSeries || colorSeries.id !== colorBy || !stop) return empty;
    const metric = config.metricsById[colorBy];
    const carry = metric.carryForward !== false;
    const values = new Map();
    const names = new Map();
    let carried = 0;
    for (const f of features) {
      const code = f.properties.ENTITY;
      if (!code || code.startsWith('PART:') || values.has(code)) continue;
      const hit = valueAt(colorSeries.series[code], stop, config.eras, { carry });
      if (!hit || typeof hit.value !== 'number') continue;
      values.set(code, hit.value);
      names.set(code, config.countries[code]?.name ?? config.entities.historical[code]?.name ?? f.properties.NAME);
      if (hit.carried) carried++;
    }
    const scale = buildScale([...values.values()], metric.format);
    const ranked = [...values].map(([code, value]) => ({ code, value, name: names.get(code) })).sort((a, b) => b.value - a.value);
    return { valueOf: (f) => values.get(f.properties.ENTITY) ?? null, scale, count: values.size, carried, ranked };
  }, [config, colorSeries, colorBy, features, stop]);

  const colorOf = useCallback(
    (f) => {
      if (!colorBy) return '#3b4a63';
      const v = choropleth.valueOf(f);
      return v === null || !choropleth.scale ? MISSING_COLOR : choropleth.scale.color(v);
    },
    [choropleth, colorBy],
  );

  const labelOf = useCallback(
    (f) => {
      const p = f.properties;
      const metric = config?.metricsById[colorBy];
      const v = choropleth.valueOf(f);
      const entity = config ? describeEntity(p.ENTITY, config, p.NAME) : null;
      const sub = entity && entity.name !== p.NAME ? `<div style="color:#94a3b8;font-size:11px">${escape(entity.name)}</div>` : '';
      const ruler = p.RULER ? `<div style="color:#fbbf24;font-size:11px">Ruled by ${escape(p.RULER)}</div>` : '';
      const val = metric ? `<div style="margin-top:2px;font-size:12px">${escape(metric.name)}: <b>${v === null ? 'no data' : escape(formatValue(v, metric.format))}</b></div>` : '';
      return `<div style="background:rgba(10,15,26,.92);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 9px;color:#e5e7eb;font:13px Inter,system-ui,sans-serif"><b>${escape(p.NAME)}</b>${sub}${ruler}${val}</div>`;
    },
    [choropleth, colorBy, config],
  );

  const select = useCallback((next) => {
    setSelection(next);
    setHistory([]);
    if (next) setSheet('data');
  }, []);

  const onGlobeSelect = useCallback(
    (f, coords) => {
      if (!f) return select(null);
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
      if (h && (stop < (h.from ?? -Infinity) || stop > (h.to ?? Infinity))) setYear(nearestStop(allowed, stop < h.from ? h.from : h.to));
      select({ key: item.code, name: null, entity: item.code, ruler: null, fromMap: false, locate: true });
    },
    [features, config, stop, allowed, select],
  );

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
  if (!config || !stop) return <div className="grid h-full place-items-center text-sm text-slate-400">Loading globe…</div>;

  const metric = config.metricsById[colorBy];
  const blockedLabel = metric && allowed[0] > config.timeline.stops[0] ? `Shaded years have no ${metric.name.toLowerCase()} data anywhere on the map.` : null;

  const dataPanel = selection && (
    <DataPanel
      key={selection.key}
      config={config}
      bundles={bundles}
      selection={selection}
      stop={stop}
      snapshotYear={snapshotYear}
      onClose={() => select(null)}
      onPickSuccessor={onPickSuccessor}
      onBack={history.length ? onBack : null}
      onOpenChart={openChart}
      embedded={!wide}
    />
  );
  const timeline = (
    <Timeline stops={config.timeline.stops} allowed={allowed} year={stop} onChange={setYear} eras={config.eras} snapshotYear={snapshotYear} blockedLabel={blockedLabel} />
  );
  const topBar = (
    <TopBar config={config} features={features} colorBy={colorBy} onColorBy={setColorBy} choropleth={choropleth} stop={stop} onPick={onPick} compact={!wide} />
  );
  const globe = (
    <GlobeView features={features} colorOf={colorOf} labelOf={labelOf} selectedKey={selection?.key} onSelect={onGlobeSelect} featureKey={featureKey} flyTo={flyTo} />
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
            <RightPanel config={config} selection={selection} bundles={bundles} stop={stop} colorBy={colorBy} />
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
        {chart && <BigChart {...chart} year={stop} onClose={() => setChart(null)} />}
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
          {sheet === 'events' && <RightPanel config={config} selection={selection} bundles={bundles} stop={stop} colorBy={colorBy} embedded show="events" />}
          {sheet === 'ask' && <RightPanel config={config} selection={selection} bundles={bundles} stop={stop} colorBy={colorBy} embedded show="chat" />}
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
      {chart && <BigChart {...chart} year={stop} onClose={() => setChart(null)} />}
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

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

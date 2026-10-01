import { useCallback, useEffect, useMemo, useState } from 'react';
import GlobeView from './components/GlobeView.jsx';
import Timeline from './components/Timeline.jsx';
import SidePanel from './components/SidePanel.jsx';
import ColorBy from './components/ColorBy.jsx';
import { loadAppConfig, isMapDerived } from './data/registry.js';
import { loadBorderIndex, loadSnapshot, nearestSnapshot } from './data/borders.js';
import { loadMetric, valueFor } from './data/metrics.js';
import { describeEntity } from './data/entities.js';
import { buildScale, MISSING_COLOR } from './data/colorScale.js';
import { formatValue } from './data/format.js';

const DEFAULT_COLOR_BY = 'population';
const featureKey = (f) => f.properties.ENTITY ?? `name:${f.properties.NAME}`;

// View state lives in the URL hash (#year=1914&color=gdp&sel=FRA) so any
// view can be bookmarked or shared.
function readHash() {
  const p = new URLSearchParams(window.location.hash.slice(1));
  return { year: Number(p.get('year')) || null, color: p.get('color'), sel: p.get('sel') };
}
function writeHash({ year, color, sel }) {
  const p = new URLSearchParams();
  if (year) p.set('year', year);
  if (color) p.set('color', color);
  if (sel) p.set('sel', sel);
  window.history.replaceState(null, '', `#${p}`);
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
    return sel ? { key: sel, name: null, entity: sel.startsWith('name:') ? null : sel, ruler: null, fromMap: true } : null;
  });
  const [flyTo, setFlyTo] = useState(null);
  const [allSeries, setAllSeries] = useState(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([loadAppConfig(), loadBorderIndex()])
      .then(([cfg, idx]) => {
        setConfig(cfg);
        setBorderIndex(idx);
        const { stops, maxYear } = cfg.timeline;
        const want = readHash().year;
        setYear(want ? stops.reduce((b, s) => (Math.abs(s - want) < Math.abs(b - want) ? s : b), stops[0]) : maxYear);
        if (readHash().color && !cfg.metricsById[readHash().color]) setColorBy(DEFAULT_COLOR_BY);
      })
      .catch((e) => setError(e.message));
  }, []);

  const snapshotYear = borderIndex && year ? nearestSnapshot(borderIndex.snapshots, year) : null;

  useEffect(() => {
    if (!snapshotYear) return;
    let alive = true;
    loadSnapshot(snapshotYear).then((f) => alive && setFeatures(f));
    return () => {
      alive = false;
    };
  }, [snapshotYear]);

  useEffect(() => {
    if (!colorBy) return;
    let alive = true;
    loadMetric(colorBy).then((s) => alive && setColorSeries({ id: colorBy, series: s }));
    return () => {
      alive = false;
    };
  }, [colorBy]);

  // Panel data: every metric file, loaded once on first selection.
  useEffect(() => {
    if (!selection || allSeries || !config) return;
    const ids = config.metrics.filter((m) => !isMapDerived(m)).map((m) => m.id);
    Promise.all(ids.map(loadMetric)).then((list) => setAllSeries(Object.fromEntries(ids.map((id, i) => [id, list[i]]))));
  }, [selection, allSeries, config]);

  useEffect(() => {
    if (year) writeHash({ year, color: colorBy ?? 'none', sel: selection?.key });
  }, [year, colorBy, selection?.key]);

  // Keep the selection's map details (name, ruler) in sync with the snapshot.
  useEffect(() => {
    if (!selection?.fromMap) return;
    const match = features.find((f) => featureKey(f) === selection.key);
    if (match && (match.properties.RULER !== selection.ruler || !selection.name)) {
      if (!selection.name) setFlyTo(centerOf(match)); // opened from the URL
      setSelection((s) => ({ ...s, name: match.properties.NAME, ruler: match.properties.RULER }));
    }
  }, [features]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choropleth values use each territory's own data only, never a proxy,
  // so the map never paints a successor's numbers onto an older state.
  const choropleth = useMemo(() => {
    if (!config || !colorSeries || colorSeries.id !== colorBy) return { valueOf: () => null, scale: null, count: 0 };
    const metric = config.metricsById[colorBy];
    const values = new Map();
    for (const f of features) {
      const code = f.properties.ENTITY;
      if (!code || code.startsWith('PART:')) continue;
      const hit = valueFor(colorSeries.series, [code], year);
      if (hit && typeof hit.value === 'number') values.set(code, hit.value);
    }
    const scale = buildScale([...values.values()], metric.format);
    return { valueOf: (f) => values.get(f.properties.ENTITY) ?? null, scale, count: values.size };
  }, [config, colorSeries, colorBy, features, year]);

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

  const onSelect = useCallback((f, coords) => {
    if (!f) return setSelection(null);
    const p = f.properties;
    setSelection({ key: featureKey(f), name: p.NAME, entity: p.ENTITY, ruler: p.RULER, fromMap: true });
    if (coords) setFlyTo({ lat: coords.lat, lng: coords.lng });
    setMobileExpanded(false);
  }, []);

  const onPickSuccessor = useCallback((iso3, fromName) => {
    setSelection({ key: iso3, name: null, entity: iso3, ruler: null, fromMap: false, viaSuccessorOf: fromName });
  }, []);

  if (error) return <div className="grid h-full place-items-center p-6 text-rose-300">Could not load data: {error}</div>;
  if (!config || !year) return <div className="grid h-full place-items-center text-sm text-slate-400">Loading globe…</div>;

  return (
    <div className="relative h-full w-full bg-[radial-gradient(ellipse_at_center,#0c1426_0%,#05070d_70%)]">
      <GlobeView features={features} colorOf={colorOf} labelOf={labelOf} selectedKey={selection?.key} onSelect={onSelect} featureKey={featureKey} flyTo={flyTo} />

      <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-col gap-3">
        <div className="pointer-events-auto">
          <h1 className="text-base font-semibold tracking-tight text-white">Economic Globe</h1>
          <p className="text-[11px] text-slate-400">Click a territory, pick a year. 1600 to {config.timeline.maxYear}.</p>
        </div>
        <div className={selection ? 'hidden md:block' : ''}>
          <ColorBy config={config} value={colorBy} onChange={setColorBy} scale={choropleth.scale} year={year} coveredCount={choropleth.count} />
        </div>
      </div>

      <div className={`pointer-events-none absolute inset-x-0 z-20 px-3 transition-all md:bottom-4 ${selection ? 'bottom-[calc(42vh+8px)] md:right-[436px]' : 'bottom-3'}`}>
        <div className="pointer-events-auto mx-auto max-w-3xl">
          <Timeline stops={config.timeline.stops} year={year} onChange={setYear} eras={config.eras} snapshotYear={snapshotYear} />
        </div>
      </div>

      {selection && (
        <SidePanel
          config={config}
          allSeries={allSeries}
          selection={selection}
          year={year}
          snapshotYear={snapshotYear}
          onClose={() => setSelection(null)}
          onPickSuccessor={onPickSuccessor}
          mobileExpanded={mobileExpanded}
          onToggleMobile={() => setMobileExpanded((v) => !v)}
        />
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

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

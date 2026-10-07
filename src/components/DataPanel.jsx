import { useEffect, useMemo, useState } from 'react';
import MetricRow from './MetricRow.jsx';
import TradeDetail from './TradeDetail.jsx';
import { flagUrl } from '../data/flags.js';
import { describeEntity, dataCodes } from '../data/entities.js';
import { valueFor, pointsOf } from '../data/metrics.js';
import { windowFor } from '../data/years.js';
import { isMapDerived, isNumeric } from '../data/registry.js';
import { formatValue } from '../data/format.js';

const TRADE_CATEGORY = 'trade';

// The selected territory's data for the selected year (or benchmark span).
export default function DataPanel({ config, bundles, selection, stop, snapshotYear, onClose, onPickSuccessor, onBack, onOpenChart, embedded }) {
  const { metrics, categories, countries, eras, tradeIndex } = config;
  const entity = useMemo(() => describeEntity(selection.entity, config, selection.name), [selection, config]);
  const inLifetime = (y) => entity.kind !== 'historical' || ((!entity.from || y >= entity.from) && (!entity.to || y <= entity.to));
  const [from, to] = windowFor(stop, eras);
  const codes = inLifetime(stop) || inLifetime(to) ? dataCodes(entity) : [];
  const codesKey = codes.join();
  const loading = codes.some((c) => bundles[c] === undefined);
  const series = (code) => (metricId) => bundles[code]?.[metricId];
  const [openSections, setOpenSections] = useState({});
  const [flag, setFlag] = useState(null);

  useEffect(() => {
    let alive = true;
    flagUrl(entity.iso2).then((url) => alive && setFlag(url));
    return () => {
      alive = false;
    };
  }, [entity.iso2]);

  const rowFor = (m) => {
    if (isMapDerived(m)) {
      if (!selection.fromMap) return null;
      return { metric: m, hit: { value: selection.ruler ? `Ruled by ${selection.ruler}` : 'Not ruled by another power on this map' } };
    }
    const hit = valueFor((code) => series(code)(m.id), codes, stop, eras, m);
    if (!hit) return null;
    const viaProxy = hit.code !== entity.code;
    const points = isNumeric(m) ? pointsOf(series(hit.code)(m.id)).filter((p) => viaProxy || inLifetime(p.year)) : null;
    return { metric: m, hit: { ...hit, viaProxy }, points };
  };

  const sections = useMemo(() => {
    if (loading) return null;
    return categories
      .map((cat) => {
        const rows = metrics.filter((m) => m.category === cat.id).map(rowFor).filter(Boolean);
        const hasTrade = cat.id === TRADE_CATEGORY && codes.some((c) => tradeIndex[c]?.products.includes(stop) || tradeIndex[c]?.partners.includes(stop));
        return { cat, rows, hasTrade };
      })
      .filter((s) => s.rows.length || s.hasTrade);
  }, [loading, bundles, codesKey, stop, selection, categories, metrics, tradeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    if (loading) return [];
    const ids = config.summaryMetrics ?? [];
    const rows = ids.map((id) => config.metricsById[id]).filter(Boolean).map(rowFor).filter(Boolean);
    // Prefer one GDP-per-person and one GDP figure: drop the long-run one when the modern one exists.
    const has = (id) => rows.some((r) => r.metric.id === id);
    return rows.filter((r) => !(r.metric.id === 'maddison_gdppc' && has('gdp_per_capita'))).slice(0, 6);
  }, [loading, bundles, codesKey, stop, selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataRows = sections?.flatMap((s) => s.rows.filter((r) => !isMapDerived(r.metric))) ?? [];
  const hasData = dataRows.length > 0 || sections?.some((s) => s.hasTrade);
  const usesProxy = dataRows.some((r) => r.hit.viaProxy);
  const proxyName = entity.proxy ? countries[entity.proxy]?.name : null;
  const rule = eras.coverageNotes?.find((n) => stop < n.before);
  const successors = entity.successors.filter((c) => countries[c]);
  const spanLabel = from === to ? `${stop}` : `${from} to ${to} (benchmark ${stop})`;

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${embedded ? '' : 'h-full'}`}>
      <header className="flex shrink-0 items-start gap-3 border-b border-white/10 px-4 pt-4 pb-3">
        {flag ? (
          <img src={flag} alt="" className="mt-1 h-7 w-10 shrink-0 rounded-sm object-cover ring-1 ring-white/15" />
        ) : (
          <div className="mt-1 grid h-7 w-10 shrink-0 place-items-center rounded-sm bg-white/5 text-[10px] text-slate-500 ring-1 ring-white/10">
            {entity.kind === 'historical' ? 'HIST' : ''}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-semibold text-white">{entity.name}</h2>
          <div className="mt-0.5 text-xs text-slate-400">
            <span className="font-medium text-slate-200 tabular-nums">{spanLabel}</span>
            {selection.name && selection.name !== entity.name && <> · on the map as “{selection.name}”</>}
          </div>
          {entity.kind === 'historical' && (entity.from || entity.to) && (
            <div className="text-[11px] text-slate-500">
              Historical state{entity.from ? ` from ${entity.from}` : ''}{entity.to ? ` to ${entity.to}` : ''}
            </div>
          )}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close data panel" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white">
            ✕
          </button>
        )}
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-6">
        {selection.viaSuccessorOf && (
          <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-lg bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100 ring-1 ring-amber-400/25">
            <span>
              Showing present-day <b>{entity.name}</b> in today's borders, opened from {selection.viaSuccessorOf}.
            </span>
            {onBack && (
              <button type="button" onClick={onBack} className="shrink-0 rounded-md px-2 py-0.5 text-amber-50 ring-1 ring-amber-300/40 hover:bg-amber-300/15">
                Back
              </button>
            )}
          </div>
        )}
        {selection.fromMap && (
          <div className="px-4 pt-3 text-[11px] text-slate-500">
            Borders from the {snapshotYear} map{snapshotYear !== stop ? `, the latest one before ${stop}` : ''}. Historical borders are approximate.
          </div>
        )}
        {rule && hasData && <div className="mx-4 mt-3 rounded-lg bg-sky-400/5 px-3 py-2 text-[12px] text-sky-100/90 ring-1 ring-sky-400/15">{rule.text}</div>}
        {usesProxy && (
          <div className="mx-4 mt-3 rounded-lg bg-amber-400/5 px-3 py-2 text-[12px] text-amber-100/90 ring-1 ring-amber-400/20">
            {entity.proxyNote ?? `Some figures are for ${proxyName}.`} Rows marked “{proxyName} figures” use that series.
          </div>
        )}

        {loading && <div className="px-4 py-6 text-sm text-slate-400">Loading data…</div>}

        {!loading && summary.length > 0 && (
          <section aria-label="Headline figures" className="mx-3 mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10">
            {summary.map(({ metric, hit }) => (
              <div key={metric.id} className="bg-ink-900 px-3 py-2.5">
                <div className="truncate text-[11px] text-slate-400" title={metric.name}>{metric.name}</div>
                <div className="truncate text-[15px] font-semibold text-white tabular-nums">
                  {metric.format === 'label' ? hit.value : formatValue(hit.value, metric.format)}
                </div>
                {hit.year !== undefined && hit.year !== stop && <div className="text-[10px] text-amber-300/90">{hit.year} value</div>}
              </div>
            ))}
          </section>
        )}

        {!loading && !hasData && (
          <div className="mx-4 mt-3 rounded-lg bg-white/5 px-3 py-3 text-[13px] text-slate-300 ring-1 ring-white/10">
            No data for this territory in this period.
            {entity.kind === 'none' && ' It is not matched to any dataset.'}
            {successors.length > 0 && (
              <div className="mt-2 text-[12px] text-slate-400">
                {entity.kind === 'part' ? 'Part of present-day:' : 'Successor states (present-day borders):'}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {successors.map((c) => (
                    <button key={c} type="button" onClick={() => onPickSuccessor(c, entity.name)} className="rounded-md bg-white/5 px-2 py-0.5 text-[12px] text-sky-200 ring-1 ring-white/10 hover:bg-sky-400/15">
                      {countries[c].name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && hasData && successors.length > 0 && entity.kind !== 'modern' && (
          <div className="px-4 pt-3 text-[11px] text-slate-500">
            Successor states:{' '}
            {successors.map((c, i) => (
              <span key={c}>
                <button type="button" onClick={() => onPickSuccessor(c, entity.name)} className="text-sky-300 hover:underline">{countries[c].name}</button>
                {i < successors.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {sections?.map(({ cat, rows, hasTrade }) => {
          const isOpen = openSections[cat.id] ?? false;
          return (
            <section key={cat.id} className="mx-3 mt-3 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setOpenSections((s) => ({ ...s, [cat.id]: !isOpen }))}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.03]"
                aria-expanded={isOpen}
              >
                <span className="text-[13px] font-semibold tracking-wide text-slate-100">{cat.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-slate-500">
                  {rows.length + (hasTrade ? 1 : 0)}
                  <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-white/5">
                  {rows.map((r) => (
                    <MetricRow key={r.metric.id} {...r} stop={stop} proxyName={proxyName} onOpenChart={(m, pts) => onOpenChart(m, pts, entity.name)} />
                  ))}
                  {hasTrade && <TradeDetail tradeIndex={tradeIndex} codes={codes} year={stop} />}
                </div>
              )}
            </section>
          );
        })}

        {!loading && hasData && (
          <p className="px-4 pt-4 text-[10.5px] leading-relaxed text-slate-500">
            Only measures with a recorded value are shown. “Value” labels mark figures from an earlier year, used when a series ended within the last 10 years. Tap “i” for definitions and sources.
          </p>
        )}
      </div>
    </div>
  );
}

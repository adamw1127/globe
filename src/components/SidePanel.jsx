import { useEffect, useMemo, useState } from 'react';
import { flagUrl } from '../data/flags.js';
import MetricRow from './MetricRow.jsx';
import TradeDetail from './TradeDetail.jsx';
import { describeEntity, dataCodes } from '../data/entities.js';
import { valueFor, seriesFor } from '../data/metrics.js';
import { isMapDerived, isNumeric } from '../data/registry.js';

const TRADE_CATEGORY = 'trade';

export default function SidePanel({ config, allSeries, selection, year, snapshotYear, onClose, onPickSuccessor, mobileExpanded, onToggleMobile }) {
  const { metrics, categories, countries, eras, tradeIndex } = config;
  const entity = useMemo(() => describeEntity(selection.entity, config, selection.name), [selection, config]);
  // A historical entity only has data within its lifetime (some datasets
  // continue a series afterwards as a regional aggregate).
  const inLifetime = (y) => entity.kind !== 'historical' || ((!entity.from || y >= entity.from) && (!entity.to || y <= entity.to));
  const codes = inLifetime(year) ? dataCodes(entity) : [];
  const codesKey = codes.join();
  const [collapsed, setCollapsed] = useState({});

  // Rows with real values for this territory and year, grouped by category.
  const sections = useMemo(() => {
    if (!allSeries) return null;
    return categories
      .map((cat) => {
        const rows = metrics
          .filter((m) => m.category === cat.id)
          .map((m) => {
            if (isMapDerived(m)) {
              if (!selection.fromMap) return null;
              const value = selection.ruler ? `Ruled by ${selection.ruler}` : 'Not ruled by another power on this map';
              return { metric: m, value };
            }
            const hit = valueFor(allSeries[m.id], codes, year);
            if (!hit) return null;
            const s = isNumeric(m) ? seriesFor({ [hit.code]: allSeries[m.id][hit.code] }, [hit.code]) : null;
            const viaProxy = hit.code !== entity.code;
            const points = viaProxy ? s?.points : s?.points.filter((p) => inLifetime(p.year));
            return { metric: m, value: hit.value, points, viaProxy };
          })
          .filter(Boolean);
        const hasTrade =
          cat.id === TRADE_CATEGORY &&
          codes.some((c) => tradeIndex[c]?.products.includes(year) || tradeIndex[c]?.partners.includes(year));
        return { cat, rows, hasTrade };
      })
      .filter((s) => s.rows.length || s.hasTrade);
  }, [allSeries, categories, metrics, codesKey, year, selection, entity.code, tradeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataRows = sections?.flatMap((s) => s.rows.filter((r) => !isMapDerived(r.metric))) ?? [];
  const hasData = dataRows.length > 0 || sections?.some((s) => s.hasTrade);
  const usesProxy = dataRows.some((r) => r.viaProxy);
  const proxyName = entity.proxy ? countries[entity.proxy]?.name : null;
  const coverage = coverageNote(eras, year, dataRows);
  const [flag, setFlag] = useState(null);
  useEffect(() => {
    let alive = true;
    flagUrl(entity.iso2).then((url) => alive && setFlag(url));
    return () => {
      alive = false;
    };
  }, [entity.iso2]);
  const successors = entity.successors.filter((c) => countries[c]);

  return (
    <aside
      className={`pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-md transition-[height] duration-300
        md:inset-y-3 md:right-3 md:left-auto md:h-auto md:w-[420px] md:rounded-2xl
        ${mobileExpanded ? 'h-[78vh]' : 'h-[42vh]'}`}
      aria-label={`Data for ${entity.name}`}
    >
      <button type="button" onClick={onToggleMobile} className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-white/20 md:hidden" aria-label={mobileExpanded ? 'Shrink panel' : 'Expand panel'} />

      <header className="flex shrink-0 items-start gap-3 border-b border-white/10 px-4 pt-3 pb-3 md:pt-4">
        {flag ? (
          <img src={flag} alt="" className="mt-1 h-7 w-10 shrink-0 rounded-sm object-cover ring-1 ring-white/15" />
        ) : (
          <div className="mt-1 grid h-7 w-10 shrink-0 place-items-center rounded-sm bg-white/5 text-[10px] text-slate-500 ring-1 ring-white/10">
            {entity.kind === 'historical' ? 'HIST' : '—'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg leading-tight font-semibold text-white">{entity.name}</h2>
          <div className="mt-0.5 text-xs text-slate-400">
            <span className="font-medium text-slate-200 tabular-nums">{year}</span>
            {selection.name && selection.name !== entity.name && <> · shown on map as “{selection.name}”</>}
          </div>
          {entity.kind === 'historical' && (entity.from || entity.to) && (
            <div className="text-[11px] text-slate-500">
              Historical entity{entity.from ? ` from ${entity.from}` : ''}{entity.to ? ` to ${entity.to}` : ''}
            </div>
          )}
          {selection.viaSuccessorOf && (
            <div className="text-[11px] text-slate-500">Present-day borders, opened from {selection.viaSuccessorOf}</div>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close panel" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-6">
        {selection.fromMap && (
          <div className="px-4 pt-3 text-[11px] text-slate-500">
            Borders from the {snapshotYear} snapshot{snapshotYear !== year ? `, the latest map before ${year}` : ''}. Historical borders are approximate.
          </div>
        )}
        {coverage && hasData && <div className="mx-4 mt-3 rounded-lg bg-sky-400/5 px-3 py-2 text-[12px] text-sky-200/90 ring-1 ring-sky-400/15">{coverage}</div>}
        {usesProxy && (
          <div className="mx-4 mt-3 rounded-lg bg-amber-400/5 px-3 py-2 text-[12px] text-amber-200/90 ring-1 ring-amber-400/20">
            {entity.proxyNote ?? `Some figures are for ${proxyName}.`} Rows marked “{proxyName} figures” use that series.
          </div>
        )}

        {!allSeries && <div className="px-4 py-6 text-sm text-slate-400">Loading data…</div>}

        {allSeries && !hasData && (
          <div className="mx-4 mt-3 rounded-lg bg-white/5 px-3 py-3 text-[13px] text-slate-300 ring-1 ring-white/10">
            No data for this entity in this period.
            {entity.kind === 'none' && ' This territory is not matched to any dataset.'}
            {successors.length > 0 && (
              <div className="mt-2 text-[12px] text-slate-400">
                {entity.kind === 'part' ? 'Part of present-day:' : 'Successor states with data in their present-day borders:'}
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

        {allSeries && hasData && successors.length > 0 && entity.kind !== 'modern' && (
          <div className="px-4 pt-3 text-[11px] text-slate-500">
            Successor states:{' '}
            {successors.map((c, i) => (
              <span key={c}>
                <button type="button" onClick={() => onPickSuccessor(c, entity.name)} className="text-sky-300 hover:underline">
                  {countries[c].name}
                </button>
                {i < successors.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {sections?.map(({ cat, rows, hasTrade }) => {
          const isCollapsed = collapsed[cat.id];
          return (
            <section key={cat.id} className="mx-3 mt-3 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.03]"
                aria-expanded={!isCollapsed}
              >
                <span className="text-[13px] font-semibold tracking-wide text-slate-100">{cat.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-slate-500">
                  {rows.length + (hasTrade ? 1 : 0)}
                  <span className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>›</span>
                </span>
              </button>
              {!isCollapsed && (
                <div className="border-t border-white/5">
                  {rows.map((r) => (
                    <MetricRow key={r.metric.id} {...r} year={year} proxyName={proxyName} />
                  ))}
                  {hasTrade && <TradeDetail tradeIndex={tradeIndex} codes={codes} year={year} />}
                </div>
              )}
            </section>
          );
        })}

        {allSeries && hasData && (
          <p className="px-4 pt-4 text-[10.5px] leading-relaxed text-slate-600">
            Only metrics with a recorded value for {year} are shown. Hover a metric name for its definition.
          </p>
        )}
      </div>
    </aside>
  );
}

// Era note from config plus a note naming the few metrics available.
function coverageNote(eras, year, rows) {
  const rule = eras.coverageNotes?.find((n) => year < n.before);
  const numeric = rows.filter((r) => isNumeric(r.metric));
  if (numeric.length > 0 && numeric.length <= 3) {
    // Lowercase the first letter for the sentence, but keep acronyms (GDP).
    const names = numeric.map((r) => r.metric.name.replace(/\s*\(.*\)$/, '').replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()));
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `Only ${list} ${names.length === 1 ? 'is' : 'are'} recorded for this year.${rule ? ` ${rule.text}` : ''}`;
  }
  return rule?.text ?? null;
}

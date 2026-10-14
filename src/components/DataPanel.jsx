import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import MetricRow, { MetricName, Percentile, EstimateTag } from './MetricRow.jsx';
import { TermText } from './Term.jsx';
import { flagUrl } from '../data/flags.js';
import { describeEntity, dataCodes } from '../data/entities.js';
import { valueFor, pointsOf } from '../data/metrics.js';
import { windowFor } from '../data/years.js';
import { isMapDerived, isNumeric } from '../data/registry.js';
import { formatValue } from '../data/format.js';
import { estimate, estimateText, notApplicable } from '../data/estimates.js';
import { getSample, aiErrorText } from '../data/ai.js';

// Trade charts load with the charting library only when the section opens.
const TradeDetail = lazy(() => import('./TradeDetail.jsx'));
const TRADE_CATEGORY = 'trade';
const shortSource = (m) => m.source.split(/[;(]/)[0].replace(/\s*\d{4}\+?\s*$/, '').trim();

// The selected territory's data for the selected year (or benchmark span):
// recorded values with their percentile, estimates (marked), and one short
// line for each measure with neither.
export default function DataPanel({ config, bundles, stats, selection, stop, mapYear, mapIsYearly, onClose, onPickSuccessor, onBack, onOpenChart, onShowParent, embedded }) {
  const { metrics, categories, countries, entities, eras, tradeIndex } = config;
  const entity = useMemo(() => describeEntity(selection.entity, config, selection.name), [selection, config]);
  const inLifetime = (y) => entity.kind !== 'historical' || ((!entity.from || y >= entity.from) && (!entity.to || y <= entity.to));
  const [from, to] = windowFor(stop, eras);
  const alive = inLifetime(stop) || inLifetime(to);
  const codes = alive ? dataCodes(entity) : [];
  const codesKey = codes.join();
  const loading = codes.some((c) => bundles[c] === undefined);
  const seriesOf = (metricId) => (code) => bundles[code]?.[metricId];
  const [openSections, setOpenSections] = useState({});
  const [flag, setFlag] = useState(null);

  useEffect(() => {
    let live = true;
    flagUrl(entity.iso2).then((url) => live && setFlag(url));
    return () => {
      live = false;
    };
  }, [entity.iso2]);

  const proxyName = entity.proxy ? countries[entity.proxy]?.name : null;

  // A row for every metric: { metric, kind: 'real' | 'est' | 'missing', ... }.
  const rowFor = (m) => {
    if (isMapDerived(m)) {
      if (!selection.fromMap) return null;
      return { metric: m, kind: 'real', hit: { value: selection.ruler ? `Ruled by ${selection.ruler}` : 'Not ruled by another power on this map' } };
    }
    if (!entity.code) return null;
    const numeric = isNumeric(m);
    // Labels and events follow the state across a rename (Polity and the war
    // datasets code the Ottoman Empire as Turkey); numbers use the successor
    // only as a marked estimate, and only for rates and per-person measures.
    const hit = valueFor(seriesOf(m.id), numeric ? [entity.code] : codes, stop, eras, m);
    if (hit) {
      const viaProxy = hit.code !== entity.code;
      const points = numeric ? pointsOf(seriesOf(m.id)(hit.code)).filter((p) => viaProxy || inLifetime(p.year)) : null;
      const p = numeric ? bundles[hit.code]?.$pct?.[m.id]?.[hit.year] : undefined;
      const n = stats[m.id]?.n?.[hit.year];
      return { metric: m, kind: 'real', hit: { ...hit, viaProxy }, points, pct: p !== undefined && n ? { p, n, year: hit.year } : null };
    }
    if (!numeric) return null;
    const na = notApplicable(m, stop);
    if (na) return { metric: m, kind: 'missing', reason: na, na: true };
    const est = estimate({ metric: m, code: entity.code, stop, eras, seriesOf: seriesOf(m.id), stats: stats[m.id], countries, historical: entities.historical });
    if (est) {
      const own = pointsOf(seriesOf(m.id)(entity.code));
      const points = est.kind === 'proxy' ? pointsOf(seriesOf(m.id)(est.proxy)) : own;
      return { metric: m, kind: 'est', est, estText: estimateText(est, m, countries), points };
    }
    return { metric: m, kind: 'missing', reason: unknownReason(m, entity, seriesOf(m.id)(entity.code), stop, proxyName) };
  };

  const statsReady = metrics.every((m) => !m.estimate || stats[m.id] !== undefined);
  const sections = useMemo(() => {
    if (loading || !statsReady) return null;
    return categories
      .map((cat) => {
        const all = metrics.filter((m) => m.category === cat.id).map(rowFor).filter(Boolean);
        const rows = all.filter((r) => r.kind !== 'missing');
        const missing = all.filter((r) => r.kind === 'missing');
        const hasTrade = cat.id === TRADE_CATEGORY && codes.some((c) => tradeIndex[c]?.products.includes(stop) || tradeIndex[c]?.partners.includes(stop));
        return { cat, rows, missing, hasTrade, real: rows.filter((r) => r.kind === 'real').length };
      })
      .filter((s) => s.rows.length || s.missing.length || s.hasTrade);
  }, [loading, statsReady, bundles, stats, codesKey, stop, selection, categories, metrics, tradeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    if (!sections) return [];
    const byId = new Map(sections.flatMap((s) => s.rows).map((r) => [r.metric.id, r]));
    const rows = (config.summaryMetrics ?? []).map((id) => byId.get(id)).filter(Boolean);
    const has = (id) => rows.some((r) => r.metric.id === id && r.kind === 'real');
    return rows.filter((r) => !(r.metric.id === 'maddison_gdppc' && has('gdp_per_capita'))).slice(0, 6);
  }, [sections, config.summaryMetrics]);

  const anyReal = sections?.some((s) => s.real > 0 || s.hasTrade);
  const usesProxy = sections?.some((s) => s.rows.some((r) => r.hit?.viaProxy));
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
          <Banner tone="amber" action={onBack && { label: 'Back', onClick: onBack }}>
            Showing present-day <b>{entity.name}</b> in today's borders, opened from {selection.viaSuccessorOf}.
          </Banner>
        )}
        {selection.notOnMap && (
          <Banner tone="amber" action={selection.notOnMap.parentKey && onShowParent && { label: `Show ${selection.notOnMap.parentName}`, onClick: onShowParent }}>
            {entity.name} is not a separate territory on the {stop} map
            {selection.notOnMap.parentName ? <>: it was part of <b>{selection.notOnMap.parentName}</b> then.</> : '.'}
          </Banner>
        )}
        {selection.fromMap && (
          <div className="px-4 pt-3 text-[11px] text-slate-500">
            {mapIsYearly ? `Borders as of ${stop}.` : `Borders from the ${mapYear} map${mapYear !== stop ? `, the latest one before ${stop}` : ''}. Historical borders are approximate.`}
          </div>
        )}
        {rule && <div className="mx-4 mt-3 rounded-lg bg-sky-400/5 px-3 py-2 text-[12px] text-sky-100/90 ring-1 ring-sky-400/15"><TermText text={rule.text} /></div>}
        {usesProxy && (
          <div className="mx-4 mt-3 rounded-lg bg-amber-400/5 px-3 py-2 text-[12px] text-amber-100/90 ring-1 ring-amber-400/20">
            {entity.proxyNote ?? `Some records are filed under ${proxyName}.`} Rows marked “{proxyName} figures” use that series.
          </div>
        )}

        {(loading || !statsReady) && <div className="px-4 py-6 text-sm text-slate-400">Loading data…</div>}

        {summary.length > 0 && (
          <section aria-label="Headline figures" className="mx-3 mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10">
            {summary.map((r) => (
              <div key={r.metric.id} className="bg-ink-900 px-3 py-2.5">
                <div className="truncate text-[11px] text-slate-400"><MetricName metric={r.metric} className="text-[11px] text-slate-400" /></div>
                <div className={`truncate text-[15px] font-semibold tabular-nums ${r.kind === 'est' ? 'text-slate-300' : 'text-white'}`}>
                  {r.kind === 'est'
                    ? r.est.kind === 'peers'
                      ? `${formatValue(r.est.low, r.metric.format)} to ${formatValue(r.est.high, r.metric.format)}`
                      : `≈ ${formatValue(r.est.value, r.metric.format)}`
                    : r.metric.format === 'label'
                      ? r.hit.value
                      : formatValue(r.hit.value, r.metric.format)}
                </div>
                {r.kind === 'est' && <div className="mt-0.5"><EstimateTag /></div>}
                {r.kind === 'real' && r.hit.year !== undefined && r.hit.year !== stop && <div className="text-[10px] text-amber-300/90">{r.hit.year} value</div>}
                {r.pct && <Percentile pct={r.pct} />}
              </div>
            ))}
          </section>
        )}

        {sections && !anyReal && (
          <div className="mx-4 mt-3 rounded-lg bg-white/5 px-3 py-3 text-[13px] text-slate-300 ring-1 ring-white/10">
            No recorded data for this territory in this period{sections.some((s) => s.rows.length) ? '; estimates are marked “est.”' : ''}.
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

        {anyReal && successors.length > 0 && entity.kind !== 'modern' && (
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

        {sections?.map(({ cat, rows, missing, hasTrade, real }) => {
          const isOpen = openSections[cat.id] ?? false;
          const ests = rows.length - real;
          return (
            <section key={cat.id} className="mx-3 mt-3 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setOpenSections((s) => ({ ...s, [cat.id]: !isOpen }))}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.03]"
                aria-expanded={isOpen}
              >
                <span className="text-[13px] font-semibold tracking-wide text-slate-100">{cat.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                  {real + (hasTrade ? 1 : 0)} recorded{ests ? ` · ${ests} est.` : ''}
                  <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-white/5">
                  {rows.map((r) => (
                    <MetricRow key={r.metric.id} {...r} stop={stop} proxyName={proxyName} onOpenChart={(m, pts) => onOpenChart(m, pts, entity.name)} />
                  ))}
                  {hasTrade && (
                    <Suspense fallback={<div className="px-4 py-3 text-[12px] text-slate-500">Loading trade…</div>}>
                      <TradeDetail tradeIndex={tradeIndex} codes={codes} year={stop} />
                    </Suspense>
                  )}
                  {missing.length > 0 && <MissingList rows={missing} entity={entity} stop={stop} span={[from, to]} />}
                </div>
              )}
            </section>
          );
        })}

        {sections && (
          <p className="px-4 pt-4 text-[10.5px] leading-relaxed text-slate-500">
            Hover or tap an underlined word for a definition. “est.” marks values worked out from real figures, never recorded directly.
            Amber year labels mark a series' latest value when it ended within the last 10 years.
          </p>
        )}
      </div>
    </div>
  );
}

function unknownReason(m, entity, own, stop, proxyName) {
  const years = own ? Object.keys(own).map(Number).filter((y) => typeof own[y] === 'number') : [];
  if (entity.kind === 'historical' && entity.proxy && m.estimate && !m.estimate.proxy) {
    return `Recorded only for present-day territories; see ${proxyName}.`;
  }
  if (years.length) {
    const first = Math.min(...years);
    const last = Math.max(...years);
    if (stop < first) return `Records for ${entity.name} start in ${first}.`;
    if (stop > last) return `Records for ${entity.name} end in ${last}.`;
    return `No record for ${entity.name} in this period.`;
  }
  if (m.firstYear && stop < m.firstYear) return `No source covers any country before ${m.firstYear}.`;
  return `${shortSource(m)} does not cover ${entity.name}.`;
}

// Measures with no value: one short line each, collapsed by default.
function MissingList({ rows, entity, stop, span }) {
  const [open, setOpen] = useState(false);
  const na = rows.filter((r) => r.na).length;
  return (
    <div className="border-t border-white/5 px-4 py-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left text-[11.5px] text-slate-400 hover:text-slate-200">
        <span>
          {rows.length} with no figure{na ? ` (${na} not applicable)` : ''}
        </span>
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5">
          {rows.map((r) => (
            <li key={r.metric.id} className="text-[11.5px] leading-snug">
              <div className="flex items-baseline justify-between gap-2">
                <MetricName metric={r.metric} className="text-[12px] text-slate-300" />
                <span className={`shrink-0 text-[10px] ${r.na ? 'text-slate-500' : 'text-slate-500'}`}>{r.na ? 'Not applicable' : 'Unknown'}</span>
              </div>
              <div className="text-slate-500">{r.reason}</div>
              {!r.na && <AskEstimate metric={r.metric} entity={entity} stop={stop} span={span} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// "Ask Claude for a rough estimate": an AI guess from general knowledge,
// shown inline, labeled, and never stored or drawn on the map.
function AskEstimate({ metric, entity, stop, span }) {
  const [state, setState] = useState(null);
  const [available, setAvailable] = useState(null);
  useEffect(() => {
    getSample().then((s) => setAvailable(Boolean(s)));
  }, []);
  if (!available) return null;
  const period = span[0] === span[1] ? `${stop}` : `${span[0]} to ${span[1]}`;
  const ask = async () => {
    const sample = await getSample();
    setState({ status: 'thinking', text: '' });
    const prompt = `Give a rough estimate of "${metric.name}" (${metric.unit}) for ${entity.name} in ${period}. ${metric.description}
Reply in at most two short sentences: first a range in the same unit, then the main basis for it (historical evidence or comparable places). If there is no reasonable basis, say so instead of guessing.`;
    try {
      const { text } = await sample(prompt, { cache: { gcTime: 24 * 3600 * 1000 }, onText: ({ text: t }) => setState({ status: 'streaming', text: t }) });
      setState({ status: 'done', text });
    } catch (e) {
      setState({ status: 'error', text: aiErrorText(e.code) ?? '' });
    }
  };
  if (!state) {
    return (
      <button type="button" onClick={ask} className="mt-0.5 text-[11px] text-sky-300 hover:underline">
        Ask Claude for a rough estimate
      </button>
    );
  }
  return (
    <div className="mt-1 rounded-md bg-white/[0.04] px-2 py-1.5 text-[11.5px] text-slate-300 ring-1 ring-white/10">
      <span className="mr-1 rounded bg-sky-400/10 px-1 text-[10px] text-sky-200 ring-1 ring-sky-400/20">Claude's guess</span>
      {state.text || 'Thinking…'}
    </div>
  );
}

function Banner({ tone, action, children }) {
  return (
    <div className={`mx-4 mt-3 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-[12px] ring-1 ${tone === 'amber' ? 'bg-amber-400/10 text-amber-100 ring-amber-400/25' : 'bg-sky-400/10 text-sky-100 ring-sky-400/25'}`}>
      <span>{children}</span>
      {action && (
        <button type="button" onClick={action.onClick} className="shrink-0 rounded-md px-2 py-0.5 text-amber-50 ring-1 ring-amber-300/40 hover:bg-amber-300/15">
          {action.label}
        </button>
      )}
    </div>
  );
}

import { useState } from 'react';
import { formatValue } from '../data/format.js';
import { metricWikiUrl, termFor } from '../data/glossary.js';
import { ordinal } from '../data/estimates.js';
import { Term, TermText } from './Term.jsx';

// One metric: its value (or estimate) for the selected year, where it ranks,
// a small trend chart (tap to enlarge) and an info toggle with the source.
// Hover the name for a definition. Labels and event lists render as tags.
export default function MetricRow({ metric, hit, est, estText, pct, points, stop, proxyName, onOpenChart }) {
  const [open, setOpen] = useState(false);
  const isEvents = metric.format === 'events';
  const isLabel = metric.format === 'label';
  const value = hit?.value ?? est?.value;
  const fromOtherYear = hit && hit.year !== undefined && hit.year !== stop;

  return (
    <div className="border-b border-white/5 px-4 py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <MetricName metric={metric} />
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`Source of ${metric.name}`}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] text-slate-500 ring-1 ring-white/10 hover:text-sky-300 focus-visible:text-sky-300"
            >
              i
            </button>
          </div>
          {metric.badge && <div className="text-[11px] text-sky-200/70"><TermText text={metric.badge} /></div>}
          {metric.unit && <div className="text-[10.5px] text-slate-500"><TermText text={metric.unit} /></div>}
        </div>
        {!isEvents && !isLabel && (
          <div className="shrink-0 text-right">
            {est?.kind === 'peers' ? (
              <div className="text-[13.5px] font-semibold text-slate-200 tabular-nums">
                {formatValue(est.low, metric.format)} to {formatValue(est.high, metric.format)}
              </div>
            ) : (
              <div className={`text-[15px] font-semibold tabular-nums ${est ? 'text-slate-200' : 'text-white'}`}>
                {est ? '≈ ' : ''}
                {formatValue(value, metric.format)}
              </div>
            )}
            {fromOtherYear && <div className="text-[10px] text-amber-300/90">{hit.year} value</div>}
            {hit?.viaProxy && <div className="text-[10px] text-amber-300/80">{proxyName} figures</div>}
            {pct && <Percentile pct={pct} />}
          </div>
        )}
      </div>

      {est && (
        <div className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-slate-400">
          <EstimateTag />
          <span>{estText}</span>
        </div>
      )}

      {open && (
        <div className="mt-1.5 rounded-md bg-white/5 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-300">
          <TermText text={metric.description} />
          <div className="mt-1 text-slate-400">
            Source:{' '}
            {metric.sourceUrl ? (
              <a href={metric.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-300 underline-offset-2 hover:underline">
                {metric.source}
              </a>
            ) : (
              metric.source
            )}
            {metric.firstYear ? ` · ${metric.firstYear} to ${metric.lastYear ?? 'today'}` : ''}
          </div>
        </div>
      )}

      {isLabel && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <LabelTag value={value} />
          {fromOtherYear && <span className="text-[10px] text-amber-300/90">{hit.year} value</span>}
          {hit?.viaProxy && <span className="text-[10px] text-amber-300/80">{proxyName} figures</span>}
        </div>
      )}

      {isEvents && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {value.map((name) => (
            <li key={name}>
              <Tag tone="rose">{name}</Tag>
            </li>
          ))}
        </ul>
      )}

      {!isEvents && !isLabel && points?.length > 1 && (
        <button
          type="button"
          onClick={() => onOpenChart?.(metric, points)}
          className="mt-1 block w-full rounded-md text-left hover:bg-white/[0.03] focus-visible:bg-white/[0.05]"
          aria-label={`Open a larger chart of ${metric.name}`}
        >
          <Sparkline points={points} mark={hit ? { year: hit.year, value: hit.value } : est && est.kind !== 'peers' ? { year: stop, value: est.value, est: true } : null} />
          <div className="flex justify-between text-[10px] text-slate-500 tabular-nums">
            <span>{points[0].year}</span>
            <span>Open chart</span>
            <span>{points[points.length - 1].year}</span>
          </div>
        </button>
      )}
    </div>
  );
}

export function MetricName({ metric, className = 'text-[13px] text-slate-200' }) {
  return (
    <Term title={metric.name} text={metric.description} url={metricWikiUrl(metric.id)} className={className}>
      {metric.name}
    </Term>
  );
}

export function Percentile({ pct }) {
  const t = termFor('percentile');
  return (
    <div className="text-[10.5px] text-slate-400">
      <Term title="Percentile" text={`Higher than about ${pct.p}% of the ${pct.n} countries with data in ${pct.year}. ${t.text}`} url={t.url}>
        {ordinal(pct.p)} percentile
      </Term>
    </div>
  );
}

export function EstimateTag() {
  const t = termFor('estimate');
  return (
    <span className="shrink-0 rounded bg-violet-400/10 px-1 text-[10px] text-violet-200 ring-1 ring-violet-400/25">
      <Term title="Estimate" text={t.text} url={t.url}>est.</Term>
    </span>
  );
}

// Regime labels such as "Anocracy (mixed)" link to their definition.
function LabelTag({ value }) {
  const word = String(value).split(/[\s(]/)[0];
  const t = termFor(word);
  return <Tag>{t ? <Term title={t.term} text={t.text} url={t.url}>{value}</Term> : value}</Tag>;
}

export function Tag({ children, tone = 'sky' }) {
  const tones = {
    sky: 'bg-sky-400/10 text-sky-200 ring-sky-400/20',
    rose: 'bg-rose-400/10 text-rose-200 ring-rose-400/20',
    amber: 'bg-amber-400/10 text-amber-200 ring-amber-400/25',
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[12px] ring-1 ${tones[tone]}`}>{children}</span>;
}

// Trend line as plain SVG: cheap enough to draw dozens while scrubbing.
function Sparkline({ points, mark }) {
  const W = 300;
  const H = 36;
  const xs = points.map((p) => p.year);
  const ys = points.map((p) => p.value);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys, mark?.value ?? Infinity);
  const y1 = Math.max(...ys, mark?.value ?? -Infinity);
  const sx = (x) => (x1 === x0 ? W / 2 : ((x - x0) / (x1 - x0)) * (W - 8) + 4);
  const sy = (y) => (y1 === y0 ? H / 2 : H - 4 - ((y - y0) / (y1 - y0)) * (H - 8));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke="#7dd3a8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {mark && mark.year >= x0 && mark.year <= x1 && (
        <circle cx={sx(mark.year)} cy={sy(mark.value)} r="3" fill={mark.est ? '#0a0f1a' : '#f8fafc'} stroke="#7dd3a8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

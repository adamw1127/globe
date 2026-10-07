import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceDot, ResponsiveContainer, Tooltip } from 'recharts';
import { formatValue, formatShort } from '../data/format.js';

// One metric: its value at the selected year, a small trend chart (click to
// enlarge), and an info toggle with the definition and source. Labels and
// event lists render as tags.
export default function MetricRow({ metric, hit, points, stop, proxyName, onOpenChart }) {
  const [open, setOpen] = useState(false);
  const isEvents = metric.format === 'events';
  const isLabel = metric.format === 'label';
  const value = hit?.value;
  const fromOtherYear = hit && hit.year !== undefined && hit.year !== stop;

  return (
    <div className="border-b border-white/5 px-4 py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-slate-200">{metric.name}</span>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`About ${metric.name}`}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] text-slate-500 ring-1 ring-white/10 hover:text-sky-300 focus-visible:text-sky-300"
            >
              i
            </button>
          </div>
          {metric.badge && <div className="text-[11px] text-sky-200/70">{metric.badge}</div>}
          {metric.unit && <div className="text-[10.5px] text-slate-500">{metric.unit}</div>}
        </div>
        {!isEvents && !isLabel && (
          <div className="shrink-0 text-right">
            <div className="text-[15px] font-semibold tabular-nums text-white">{formatValue(value, metric.format)}</div>
            {fromOtherYear && <div className="text-[10px] text-amber-300/90">{hit.year} value</div>}
            {hit?.viaProxy && <div className="text-[10px] text-amber-300/80">{proxyName} figures</div>}
          </div>
        )}
      </div>

      {open && (
        <div className="mt-1.5 rounded-md bg-white/5 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-300">
          {metric.description}
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
          <Tag>{value}</Tag>
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
          <div className="pointer-events-none h-9">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip content={() => null} />
                <Line dataKey="value" type="monotone" dot={false} stroke="#64b2de" strokeWidth={1.5} isAnimationActive={false} />
                {value !== undefined && hit?.year !== undefined && <ReferenceDot x={hit.year} y={value} r={3} fill="#f8fafc" stroke="#64b2de" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 tabular-nums">
            <span>{points[0].year}</span>
            <span className="text-slate-500">Open chart</span>
            <span>{points[points.length - 1].year}</span>
          </div>
        </button>
      )}
    </div>
  );
}

export function Tag({ children, tone = 'sky' }) {
  const tones = {
    sky: 'bg-sky-400/10 text-sky-200 ring-sky-400/20',
    rose: 'bg-rose-400/10 text-rose-200 ring-rose-400/20',
    amber: 'bg-amber-400/10 text-amber-200 ring-amber-400/25',
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[12px] ring-1 ${tones[tone]}`}>{children}</span>;
}

export { formatShort };

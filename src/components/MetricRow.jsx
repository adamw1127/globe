import { LineChart, Line, XAxis, YAxis, ReferenceDot, ResponsiveContainer, Tooltip } from 'recharts';
import { formatValue, formatShort } from '../data/format.js';

// One metric: value for the selected year plus a small trend chart.
// Labels and event lists render as tags instead of a chart.
export default function MetricRow({ metric, value, points, year, viaProxy, proxyName }) {
  const isEvents = metric.format === 'events';
  const isLabel = metric.format === 'label';

  return (
    <div className="group border-b border-white/5 px-4 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] text-slate-300" title={metric.description}>
            {metric.name}
          </div>
          <div className="truncate text-[10.5px] text-slate-500" title={metric.source}>
            {metric.unit ? `${metric.unit} · ` : ''}
            {metric.source}
          </div>
        </div>
        {!isEvents && !isLabel && (
          <div className="shrink-0 text-right">
            <div className="text-[15px] font-semibold tabular-nums text-white">{formatValue(value, metric.format)}</div>
            {viaProxy && <div className="text-[10px] text-amber-300/80">{proxyName} figures</div>}
          </div>
        )}
      </div>

      {isLabel && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Tag>{value}</Tag>
          {viaProxy && <span className="self-center text-[10px] text-amber-300/80">{proxyName} figures</span>}
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

      {!isEvents && !isLabel && points && points.length > 1 && (
        <div className="mt-1 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                cursor={{ stroke: '#475569', strokeWidth: 1 }}
                contentStyle={{ background: '#0a0f1a', border: '1px solid #2a3548', borderRadius: 8, fontSize: 11, padding: '4px 8px' }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0', padding: 0 }}
                formatter={(v) => [formatShort(v, metric.format), null]}
                separator=""
              />
              <Line dataKey="value" type="monotone" dot={false} stroke="#38bdf8" strokeWidth={1.5} isAnimationActive={false} />
              {value !== undefined && <ReferenceDot x={year} y={value} r={3} fill="#f8fafc" stroke="#38bdf8" />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {!isEvents && !isLabel && points && points.length > 1 && (
        <div className="flex justify-between text-[10px] text-slate-600 tabular-nums">
          <span>{points[0].year}</span>
          <span>{points[points.length - 1].year}</span>
        </div>
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

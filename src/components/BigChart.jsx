import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { formatShort, formatValue } from '../data/format.js';

// Full-size chart of one metric for one territory, with a log scale for
// series spanning orders of magnitude (long-run GDP, population).
export default function BigChart({ metric, points, entityName, year, onClose }) {
  const positive = points.every((p) => p.value > 0);
  const values = points.map((p) => p.value);
  const wide = positive && Math.max(...values) / Math.min(...values) > 50;
  const [log, setLog] = useState(wide);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${metric.name}, ${entityName}`}
        className="w-full max-w-3xl rounded-2xl border border-white/10 bg-ink-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">{metric.name}</h3>
            <p className="text-xs text-slate-400">
              {entityName} · {metric.unit} · {points[0].year} to {points[points.length - 1].year}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {positive && (
              <label className="flex items-center gap-1.5 text-xs text-slate-300">
                <input id="chart-log" type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} className="accent-sky-400" />
                Log scale
              </label>
            )}
            <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm text-slate-300 ring-1 ring-white/15 hover:bg-white/10">
              Close
            </button>
          </div>
        </div>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#2a3548" />
              <YAxis
                scale={log ? 'log' : 'auto'}
                domain={log ? ['auto', 'auto'] : ['auto', 'auto']}
                tickFormatter={(v) => formatShort(v, metric.format)}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                stroke="#2a3548"
                width={64}
                allowDataOverflow={false}
              />
              <Tooltip
                contentStyle={{ background: '#0a0f1a', border: '1px solid #2a3548', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(v) => [formatValue(v, metric.format), metric.name]}
              />
              <ReferenceLine x={year} stroke="#f8fafc" strokeDasharray="3 3" />
              <Line dataKey="value" type="monotone" dot={points.length < 40 ? { r: 2.5, fill: '#64b2de' } : false} stroke="#64b2de" strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Dashed line: selected year. Source:{' '}
          {metric.sourceUrl ? (
            <a href={metric.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{metric.source}</a>
          ) : (
            metric.source
          )}
        </p>
      </div>
    </div>
  );
}

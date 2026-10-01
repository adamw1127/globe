import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { loadTrade } from '../data/trade.js';
import { formatValue } from '../data/format.js';
import { Tag } from './MetricRow.jsx';

// Top 5 exports / imports by product and top partners for one territory-year.
// Calls onAvailability(true|false) so the parent can hide an empty section.
export default function TradeDetail({ tradeIndex, codes, year, onAvailability }) {
  const [state, setState] = useState({ key: null, data: null });
  const key = `${codes.join(',')}|${year}`;

  useEffect(() => {
    let alive = true;
    loadTrade(tradeIndex, codes, year).then((data) => {
      if (!alive) return;
      setState({ key, data });
      onAvailability?.(Boolean(data));
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.key !== key) return <div className="px-4 py-3 text-xs text-slate-500">Loading trade detail…</div>;
  const data = state.data;
  if (!data) {
    return <Note>Product-level and partner trade data is not available for {year}.</Note>;
  }
  const productsMock = data.sources?.products === 'MOCK';
  const partnersMock = data.sources?.partners === 'MOCK';

  return (
    <div className="space-y-4 px-4 py-3">
      {data.exports?.length ? (
        <>
          <Bars title="Top 5 exports" rows={data.exports} labelKey="product" color="#34d399" sample={productsMock} />
          <Bars title="Top 5 imports" rows={data.imports} labelKey="product" color="#f59e0b" sample={productsMock} />
        </>
      ) : (
        <Note inline>Product-level trade data is not available for {year}.</Note>
      )}
      {data.partners ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1">
          {data.partners.exports && <Bars title="Top export partners" rows={data.partners.exports} labelKey="name" color="#38bdf8" sample={partnersMock} />}
          {data.partners.imports && <Bars title="Top import partners" rows={data.partners.imports} labelKey="name" color="#a78bfa" sample={partnersMock} />}
          {!partnersMock && data.sources?.partners && <div className="text-[10.5px] text-slate-500">Partners: {data.sources.partners}</div>}
        </div>
      ) : (
        <Note inline>Trading partner data is not available for {year}.</Note>
      )}
    </div>
  );
}

function Bars({ title, rows, labelKey, color, sample }) {
  const data = rows.map((r) => ({ ...r, label: r[labelKey] }));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[12px] font-medium tracking-wide text-slate-300 uppercase">{title}</div>
        {sample && <Tag tone="amber">Sample data</Tag>}
      </div>
      <div style={{ height: data.length * 28 + 4 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="label" width={138} tickLine={false} axisLine={false} tick={{ fill: '#cbd5e1', fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#0a0f1a', border: '1px solid #2a3548', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(v, _n, p) => [`${v.toFixed(1)}% of total${p.payload.value ? ` · ${formatValue(p.payload.value, 'usd_compact')}` : ''}`, null]}
              separator=""
            />
            <Bar dataKey="share" fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="share" position="right" formatter={(v) => `${v.toFixed(1)}%`} style={{ fill: '#94a3b8', fontSize: 10.5 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-0.5 text-[10.5px] text-slate-500">
        {rows.map((r) => (r.value ? `${r[labelKey]} ${formatValue(r.value, 'usd_compact')}` : null)).filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

function Note({ children, inline }) {
  return <div className={`${inline ? '' : 'px-4 py-3'} text-xs text-slate-400 italic`}>{children}</div>;
}

import { isNumeric, isMapDerived } from '../data/registry.js';

// "Color by" dropdown (grouped by category) and the choropleth legend.
export default function ColorBy({ config, value, onChange, scale, year, coveredCount }) {
  const metric = config.metricsById[value];
  return (
    <div className="pointer-events-auto w-[min(320px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-ink-900/85 p-3 shadow-2xl backdrop-blur-md">
      <label htmlFor="color-by" className="mb-1 block text-[11px] font-medium tracking-wide text-slate-400 uppercase">
        Color by
      </label>
      <select
        id="color-by"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-400/60"
      >
        <option value="">None</option>
        {config.categories.map((cat) => {
          const opts = config.metrics.filter((m) => m.category === cat.id && isNumeric(m) && !isMapDerived(m));
          if (!opts.length) return null;
          return (
            <optgroup key={cat.id} label={cat.name}>
              {opts.map((m) => (
                <option key={m.id} value={m.id} disabled={year < m.firstYear || (m.lastYear && year > m.lastYear)}>
                  {m.name}
                  {year < m.firstYear ? ` (from ${m.firstYear})` : m.lastYear && year > m.lastYear ? ` (to ${m.lastYear})` : ''}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>

      {metric && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-baseline justify-between text-[11px] text-slate-400">
            <span className="truncate">{metric.unit}</span>
            <span className="shrink-0 tabular-nums">{coveredCount} territories with data</span>
          </div>
          {scale ? (
            <ul className="space-y-0.5">
              {scale.legend.map((b) => (
                <li key={b.label} className="flex items-center gap-2 text-[11px] text-slate-300 tabular-nums">
                  <span className="h-2.5 w-5 rounded-sm" style={{ background: b.color }} />
                  {b.label}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[11px] text-slate-500 italic">No territory has data for {year}.</div>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="h-2.5 w-5 rounded-sm bg-[#2b3240] ring-1 ring-white/10" />
            No data
          </div>
        </div>
      )}
    </div>
  );
}

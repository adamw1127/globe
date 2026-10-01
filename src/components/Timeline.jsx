import { useEffect, useMemo, useRef, useState } from 'react';

const ERA_COLORS = ['#f59e0b', '#a78bfa', '#38bdf8', '#34d399', '#f472b6'];

// Year slider. The track is proportional to time, but the handle snaps to
// `stops` (computed from the data), so sparse centuries jump between the
// years that have data while dense periods move year by year.
export default function Timeline({ stops, year, onChange, eras, snapshotYear }) {
  const min = stops[0];
  const max = stops[stops.length - 1];
  const [playing, setPlaying] = useState(false);
  const idx = stops.indexOf(year);
  const pct = (y) => ((y - min) / (max - min)) * 100;

  const nearest = (y) => stops.reduce((best, s) => (Math.abs(s - y) < Math.abs(best - y) ? s : best), stops[0]);
  const step = (dir) => {
    const i = Math.min(stops.length - 1, Math.max(0, (idx === -1 ? stops.indexOf(nearest(year)) : idx) + dir));
    onChange(stops[i]);
  };

  // Tick marks for the sparse stretch so users can see where data exists.
  const sparseTicks = useMemo(
    () => stops.filter((s, i) => (stops[i + 1] ?? s) - s > 1 || s - (stops[i - 1] ?? s) > 1),
    [stops],
  );

  const eraBands = useMemo(
    () =>
      eras.eras
        .map((e, i) => {
          const start = Math.max(e.start, min);
          const end = Math.min(e.end ?? max, max);
          return { ...e, start, end, color: ERA_COLORS[i % ERA_COLORS.length] };
        })
        .filter((e) => e.end > e.start),
    [eras, min, max],
  );
  const era = eraBands.find((e) => year >= e.start && (year < e.end || e.end === max));

  const yearRef = useRef(year);
  yearRef.current = year;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const i = stops.indexOf(yearRef.current);
      if (i >= stops.length - 1) {
        setPlaying(false);
        return;
      }
      onChange(stops[i + 1]);
    }, 450);
    return () => clearInterval(t);
  }, [playing, stops, onChange]);

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/85 px-4 pt-3 pb-2 shadow-2xl backdrop-blur-md">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Previous year with data" onClick={() => step(-1)}>‹</IconButton>
          <IconButton label={playing ? 'Pause' : 'Play through time'} onClick={() => setPlaying((p) => !p)}>
            {playing ? '❚❚' : '▶'}
          </IconButton>
          <IconButton label="Next year with data" onClick={() => step(1)}>›</IconButton>
        </div>
        <div className="text-3xl font-semibold tabular-nums tracking-tight text-white">{year}</div>
        <div className="min-w-0 flex-1 leading-tight">
          {era && (
            <div className="truncate text-xs font-medium" style={{ color: era.color }}>
              {era.label}
            </div>
          )}
          <div className="truncate text-[11px] text-slate-400">
            Borders: {snapshotYear} snapshot{snapshotYear !== year ? ' (approximate)' : ''}
          </div>
        </div>
      </div>

      <div className="relative">
        <input
          type="range"
          className="timeline relative z-10"
          min={min}
          max={max}
          step={1}
          value={year}
          aria-label="Year"
          aria-valuetext={`${year}`}
          onChange={(e) => onChange(nearest(Number(e.target.value)))}
          onKeyDown={(e) => {
            if (['ArrowRight', 'ArrowUp'].includes(e.key)) { e.preventDefault(); step(1); }
            if (['ArrowLeft', 'ArrowDown'].includes(e.key)) { e.preventDefault(); step(-1); }
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-[17px] h-2">
          {sparseTicks.map((s) => (
            <span key={s} className="absolute h-1.5 w-px bg-slate-500" style={{ left: `${pct(s)}%` }} />
          ))}
        </div>
      </div>

      <div className="relative mt-0.5 h-5">
        {eraBands.map((e) => (
          <div
            key={e.label}
            className="absolute top-0 h-full overflow-hidden border-l pl-1 text-[10px] leading-5 whitespace-nowrap text-ellipsis"
            style={{ left: `${pct(e.start)}%`, width: `${pct(e.end) - pct(e.start)}%`, borderColor: e.color, color: e.color }}
            title={`${e.label} (${e.start} to ${e.end === max && !eras.eras.find((x) => x.label === e.label)?.end ? 'today' : e.end})`}
          >
            {e.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-full text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

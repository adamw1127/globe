import { useEffect, useMemo, useRef, useState } from 'react';
import { nearestStop } from '../data/years.js';

const ERA_COLORS = ['#f59e0b', '#a78bfa', '#38bdf8', '#34d399', '#f472b6'];


// Year slider. The track is proportional to time; the handle snaps to the
// `allowed` stops: benchmark years before 1820, then yearly, minus the years
// in which the chosen measure would leave the whole globe blank. The blocked
// stretch at the start is shaded.
export default function Timeline({ stops, allowed, year, onChange, eras, mapLabel, blockedLabel }) {
  const min = stops[0];
  const max = stops[stops.length - 1];
  const [playing, setPlaying] = useState(false);
  const [typed, setTyped] = useState(null);
  const pct = (y) => ((y - min) / (max - min)) * 100;
  const first = allowed[0];

  const step = (dir) => {
    const i = allowed.indexOf(nearestStop(allowed, year));
    onChange(allowed[Math.min(allowed.length - 1, Math.max(0, i + dir))]);
  };

  // Ticks at benchmark years so the sparse stretch shows where data sits.
  const ticks = useMemo(() => allowed.filter((s) => s < (eras.annualFrom ?? 0)), [allowed, eras]);

  const eraBands = useMemo(
    () =>
      eras.eras
        .map((e, i) => ({ ...e, start: Math.max(e.start, min), end: Math.min(e.end ?? max, max), color: ERA_COLORS[i % ERA_COLORS.length] }))
        .filter((e) => e.end > e.start),
    [eras, min, max],
  );
  const era = eraBands.find((e) => year >= e.start && (year < e.end || e.end === max));
  const benchmark = year < (eras.annualFrom ?? 0);
  const next = eras.benchmarks?.[eras.benchmarks.indexOf(year) + 1] ?? eras.annualFrom;

  const yearRef = useRef(year);
  yearRef.current = year;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const i = allowed.indexOf(yearRef.current);
      if (i === -1 || i >= allowed.length - 1) {
        setPlaying(false);
        return;
      }
      onChange(allowed[i + 1]);
    }, 600);
    return () => clearInterval(t);
  }, [playing, allowed, onChange]);

  const commitTyped = () => {
    const n = Number(typed);
    if (typed !== null && Number.isFinite(n) && typed.trim()) onChange(nearestStop(allowed, n));
    setTyped(null);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/85 px-3 pt-2.5 pb-1.5 shadow-2xl backdrop-blur-md sm:px-4">
      <div className="mb-1 flex items-center gap-2 sm:gap-3">
        <div className="flex items-center">
          <IconButton label="Previous year" onClick={() => step(-1)}>‹</IconButton>
          <IconButton label={playing ? 'Pause' : 'Play through time'} onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚' : '▶'}</IconButton>
          <IconButton label="Next year" onClick={() => step(1)}>›</IconButton>
        </div>
        <label htmlFor="year-input" className="sr-only">Year</label>
        <input
          id="year-input"
          inputMode="numeric"
          value={typed ?? String(year)}
          onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          onFocus={(e) => e.target.select()}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur();
            if (e.key === 'Escape') { setTyped(null); e.target.blur(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
          }}
          title="Type a year and press Enter"
          className="w-[4.2ch] rounded-md bg-transparent text-2xl font-semibold tracking-tight text-white tabular-nums outline-none ring-sky-400/50 hover:ring-1 focus:ring-2 sm:text-3xl"
        />
        <div className="min-w-0 flex-1 leading-tight">
          {benchmark ? (
            <div className="truncate text-xs font-medium text-amber-200">Benchmark: {year} to {next - 1}</div>
          ) : (
            era && <div className="truncate text-xs font-medium" style={{ color: era.color }}>{era.label}</div>
          )}
          <div className="truncate text-[11px] text-slate-400">{mapLabel}</div>
        </div>
        <div className="hidden shrink-0 text-[10.5px] text-slate-500 md:block">
          <kbd className="rounded bg-white/10 px-1">←</kbd> <kbd className="rounded bg-white/10 px-1">→</kbd> step · type a year
        </div>
      </div>

      <div className="relative">
        {first > min && (
          <div
            className="absolute top-[8px] left-0 z-20 h-3 rounded-l bg-[repeating-linear-gradient(135deg,rgba(148,163,184,.25)_0_3px,transparent_3px_7px)]"
            style={{ width: `${pct(first)}%` }}
            title={blockedLabel}
          />
        )}
        <input
          type="range"
          className="timeline relative z-10"
          min={min}
          max={max}
          step={1}
          value={year}
          aria-label="Year"
          aria-valuetext={`${year}`}
          onChange={(e) => onChange(nearestStop(allowed, Number(e.target.value)))}
          onKeyDown={(e) => {
            if (['ArrowRight', 'ArrowUp'].includes(e.key)) { e.preventDefault(); step(1); }
            if (['ArrowLeft', 'ArrowDown'].includes(e.key)) { e.preventDefault(); step(-1); }
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-[17px] h-2">
          {ticks.map((s) => (
            <span key={s} className="absolute h-1.5 w-px bg-slate-400" style={{ left: `${pct(s)}%` }} />
          ))}
        </div>
      </div>

      <div className="relative mt-0.5 h-5">
        {eraBands.map((e) => (
          <div
            key={e.label}
            className="absolute top-0 h-full overflow-hidden border-l pl-1 text-[10px] leading-5 whitespace-nowrap text-ellipsis"
            style={{ left: `${pct(e.start)}%`, width: `${pct(e.end) - pct(e.start)}%`, borderColor: e.color, color: e.color }}
          >
            {e.label}
          </div>
        ))}
      </div>
      {first > min && blockedLabel && <div className="text-[10.5px] text-slate-500">{blockedLabel}</div>}
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
      className="grid h-9 w-9 place-items-center rounded-full text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

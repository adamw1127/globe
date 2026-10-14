import { useEffect, useMemo, useRef, useState } from 'react';
import { isNumeric, isMapDerived } from '../data/registry.js';
import { formatValue } from '../data/format.js';
import { MISSING_COLOR, faded } from '../data/colorScale.js';

// Search, "color by" picker, legend and the top/bottom 10 for the map.
export default function TopBar({ config, features, colorBy, onColorBy, choropleth, stop, onPick, compact, fixedScale, onFixedScale }) {
  const metric = config.metricsById[colorBy];
  const [legendOpen, setLegendOpen] = useState(!compact);
  const [rankOpen, setRankOpen] = useState(false);

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <div className="flex flex-wrap items-stretch gap-2">
        <Search config={config} features={features} onPick={onPick} />
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-xl border border-white/10 bg-ink-900/85 px-2.5 shadow-xl backdrop-blur-md">
          <label htmlFor="color-by" className="shrink-0 text-[11px] text-slate-400">Color by</label>
          <select
            id="color-by"
            value={colorBy ?? ''}
            onChange={(e) => onColorBy(e.target.value || null)}
            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-slate-100 outline-none"
          >
            <option value="" className="bg-ink-800">None</option>
            {config.categories.map((cat) => {
              const opts = config.metrics.filter((m) => m.category === cat.id && isNumeric(m) && !isMapDerived(m));
              if (!opts.length) return null;
              return (
                <optgroup key={cat.id} label={cat.name} className="bg-ink-800">
                  {opts.map((m) => (
                    <option key={m.id} value={m.id} className="bg-ink-800">
                      {m.name} ({m.firstYear} to {m.lastYear})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
      </div>

      {metric && (
        <div className="rounded-xl border border-white/10 bg-ink-900/85 px-3 py-2 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <button type="button" onClick={() => setLegendOpen((v) => !v)} className="min-w-0 truncate text-left hover:text-slate-200" aria-expanded={legendOpen}>
              <span className="text-slate-200">{metric.name}</span> · {metric.unit} <span className="text-slate-500">{legendOpen ? '▾' : '▸'}</span>
            </button>
            <button
              type="button"
              onClick={() => setRankOpen((v) => !v)}
              disabled={!choropleth.count}
              aria-expanded={rankOpen}
              className="shrink-0 rounded-md px-2 py-0.5 text-sky-200 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40"
            >
              Top / bottom 10
            </button>
          </div>
          {legendOpen && <Legend scale={choropleth.scale} count={choropleth.count} carried={choropleth.carried} estimated={choropleth.estimated} stop={stop} fixedScale={fixedScale} onFixedScale={onFixedScale} />}
          {rankOpen && choropleth.count > 0 && (
            <Rankings ranked={choropleth.ranked} metric={metric} onPick={(code) => { onPick({ code }); if (compact) setRankOpen(false); }} />
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ scale, count, carried, estimated, stop, fixedScale, onFixedScale }) {
  if (!scale) return <div className="mt-1.5 text-[11px] text-slate-500 italic">No territory has data for {stop}.</div>;
  const ends = scale.better === 'up' ? ['Low (worse)', 'High (better)'] : scale.better === 'down' ? ['Low (better)', 'High (worse)'] : ['Low', 'High'];
  return (
    <div className="mt-1.5">
      <div className="flex gap-0.5">
        {scale.legend.map((b) => (
          <div key={b.label} className="min-w-0 flex-1">
            <div className="h-2.5 rounded-sm" style={{ background: b.color }} />
            <div className="mt-0.5 truncate text-[10px] text-slate-300 tabular-nums" title={b.label}>{b.label}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm ring-1 ring-white/10" style={{ background: MISSING_COLOR }} /> No figure
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm ring-1 ring-white/10" style={{ background: faded(scale.legend[Math.floor(scale.legend.length / 2)].color) }} /> Faded: estimate
        </span>
        <span className="tabular-nums">{count} recorded{estimated ? `, ${estimated} estimated` : ''}</span>
        {carried > 0 && <span className="text-amber-200/80">{carried} use their latest earlier value</span>}
        <label className="flex items-center gap-1 text-slate-400">
          <input type="checkbox" checked={fixedScale} onChange={(e) => onFixedScale(e.target.checked)} className="accent-emerald-400" />
          Same colors in every year
        </label>
      </div>
    </div>
  );
}

function Rankings({ ranked, metric, onPick }) {
  const top = ranked.slice(0, 10);
  const bottom = ranked.length > 10 ? ranked.slice(-Math.min(10, ranked.length - 10)).reverse() : [];
  return (
    <div className="scroll-thin mt-2 flex max-h-[40vh] gap-3 overflow-y-auto border-t border-white/10 pt-2">
      <RankList title="Highest" rows={top} rank={(i) => i + 1} metric={metric} onPick={onPick} />
      {bottom.length > 0 && <RankList title="Lowest" rows={bottom} rank={(i) => ranked.length - i} metric={metric} onPick={onPick} />}
    </div>
  );
}

function RankList({ title, rows, rank, metric, onPick }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10.5px] font-medium tracking-wide text-slate-500 uppercase">{title}</div>
      <ol className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={r.code}>
            <button type="button" onClick={() => onPick(r.code)} className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left text-[12px] hover:bg-white/10">
              <span className="w-5 shrink-0 text-right text-[10.5px] text-slate-500 tabular-nums">{rank(i)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-200">{r.name}</span>
              <span className="shrink-0 text-slate-300 tabular-nums">{formatValue(r.value, metric.format)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Combobox over countries, historical states and the names on the current map.
function Search({ config, features, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  const index = useMemo(() => {
    const items = new Map();
    for (const [code, c] of Object.entries(config.countries)) items.set(code, { code, name: c.name, kind: 'Country' });
    for (const [code, h] of Object.entries(config.entities.historical)) {
      items.set(code, { code, name: h.name, kind: `Historical${h.from ? `, ${h.from} to ${h.to ?? 'later'}` : ''}` });
    }
    for (const f of features) {
      const p = f.properties;
      const key = `map:${p.NAME}`;
      if (p.NAME && !items.has(key) && ![...items.values()].some((it) => it.name === p.NAME)) {
        items.set(key, { code: p.ENTITY, name: p.NAME, kind: 'On this map', feature: f });
      }
    }
    return [...items.values()];
  }, [config, features]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const score = (it) => {
      const n = it.name.toLowerCase();
      if (n === s || it.code?.toLowerCase() === s) return 0;
      if (n.startsWith(s)) return 1;
      if (n.split(/[\s(-]+/).some((w) => w.startsWith(s))) return 2;
      return n.includes(s) ? 3 : 9;
    };
    return index
      .map((it) => ({ it, s: score(it) }))
      .filter((x) => x.s < 9)
      .sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name))
      .slice(0, 8)
      .map((x) => x.it);
  }, [q, index]);

  useEffect(() => {
    const onDown = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const choose = (it) => {
    onPick(it);
    setQ('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 basis-48">
      <label htmlFor="search" className="sr-only">Find a country</label>
      <input
        id="search"
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        autoComplete="off"
        value={q}
        placeholder="Find a country or state…"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]); }
          if (e.key === 'Escape') setOpen(false);
        }}
        className="h-full w-full rounded-xl border border-white/10 bg-ink-900/85 px-3 py-2 text-[13px] text-slate-100 shadow-xl backdrop-blur-md outline-none placeholder:text-slate-500 focus:border-sky-400/60"
      />
      {open && results.length > 0 && (
        <ul id="search-results" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-2xl">
          {results.map((it, i) => (
            <li key={`${it.kind}:${it.code}:${it.name}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onClick={() => choose(it)}
                onPointerEnter={() => setActive(i)}
                className={`flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-[13px] ${i === active ? 'bg-white/10' : ''}`}
              >
                <span className="truncate text-slate-100">{it.name}</span>
                <span className="shrink-0 text-[10.5px] text-slate-500">{it.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

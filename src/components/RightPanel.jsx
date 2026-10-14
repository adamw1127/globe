import { useEffect, useMemo, useRef, useState } from 'react';
import { describeEntity, dataCodes } from '../data/entities.js';
import { loadEntity, valueFor } from '../data/metrics.js';
import { windowFor } from '../data/years.js';
import { dataEvents } from '../data/events.js';
import { loadTrade } from '../data/trade.js';
import { formatValue } from '../data/format.js';
import { getSample, aiErrorText } from '../data/ai.js';

const KIND_STYLE = {
  war: 'bg-rose-400/10 text-rose-200 ring-rose-400/20',
  politics: 'bg-violet-400/10 text-violet-200 ring-violet-400/20',
  economy: 'bg-amber-400/10 text-amber-200 ring-amber-400/20',
};
const KIND_LABEL = { war: 'War', politics: 'Politics', economy: 'Economy' };

// Right column: notable events for the selection (top) and the AI chat (bottom).
export default function RightPanel({ config, selection, bundles, stop, colorBy, embedded, show = 'both' }) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${embedded ? '' : 'h-full'}`}>
      {show !== 'chat' && (
        <div className={`${show === 'both' ? 'max-h-[48%] border-b border-white/10' : 'flex-1'} flex min-h-0 flex-col`}>
          <EventsPanel config={config} selection={selection} bundles={bundles} stop={stop} />
        </div>
      )}
      {show !== 'events' && <ChatPanel config={config} selection={selection} stop={stop} colorBy={colorBy} />}
    </div>
  );
}

function useEntity(config, selection) {
  return useMemo(() => (selection ? describeEntity(selection.entity, config, selection.name) : null), [config, selection]);
}

function EventsPanel({ config, selection, bundles, stop }) {
  const entity = useEntity(config, selection);
  const [from, to] = windowFor(stop, config.eras);
  const codes = entity ? dataCodes(entity) : [];
  const loading = codes.some((c) => bundles[c] === undefined);
  const series = (id) => {
    for (const c of codes) if (bundles[c]?.[id]) return bundles[c][id];
    return undefined;
  };
  const events = entity && !loading ? dataEvents({ series, entity, from, to, metricsById: config.metricsById }) : [];
  const spanLabel = from === to ? `${stop}` : `${from} to ${to}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-4 pb-2">
        <h2 className="text-[13px] font-semibold tracking-wide text-slate-100">Notable events</h2>
        <p className="text-[11px] text-slate-500">{entity ? `${entity.name}, ${spanLabel}` : 'Select a territory on the globe.'}</p>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {entity && <AiSummary config={config} entity={entity} events={events} series={series} stop={stop} span={[from, to]} ready={!loading} />}
        {entity && !loading && (
          <div className="mt-3">
            <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-slate-500 uppercase">From the datasets</div>
            {events.length ? (
              <ul className="space-y-1.5">
                {events.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-slate-200">
                    <span className="w-9 shrink-0 text-[11px] text-slate-500 tabular-nums">{e.year}</span>
                    <span className={`shrink-0 rounded px-1.5 text-[10px] ring-1 ${KIND_STYLE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                    <span className="min-w-0">{e.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-slate-500">No wars, regime changes, crises or extreme inflation or recessions recorded for this period.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Short AI-written summary of the period, generated when the selection or
// year has been still for a moment. Labeled as AI-written.
function AiSummary({ config, entity, events, series, stop, span, ready }) {
  const [state, setState] = useState({ status: 'idle', text: '' });
  const [available, setAvailable] = useState(null);
  const key = `${entity.code ?? entity.name}|${stop}`;

  useEffect(() => {
    getSample().then((s) => setAvailable(Boolean(s)));
  }, []);

  useEffect(() => {
    if (!available || !ready) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      const sample = await getSample();
      if (!sample || ctl.signal.aborted) return;
      setState({ status: 'thinking', text: '' });
      const figures = ['population', 'gdp_per_capita', 'maddison_gdppc', 'gdp_growth', 'inflation', 'regime_type']
        .map((id) => {
          const m = config.metricsById[id];
          const hit = m && valueFor(() => series(id), [0], stop, config.eras, m);
          return hit ? `${m.name}: ${m.format === 'label' ? hit.value : formatValue(hit.value, m.format)} (${hit.year})` : null;
        })
        .filter(Boolean);
      const period = span[0] === span[1] ? `the year ${stop}` : `the years ${span[0]} to ${span[1]}`;
      const prompt = [
        `Write a short summary of the most notable events in ${entity.name} during ${period}, for a globe that shows economic history.`,
        entity.kind === 'historical' ? `${entity.name} is a historical state${entity.from ? ` (${entity.from} to ${entity.to ?? 'later'})` : ''}.` : '',
        'Focus on political and economic events. Mention social or cultural events only if they were extremely important to the country\'s socioeconomic setting.',
        events.length ? `Events recorded in the globe's datasets:\n${events.map((e) => `- ${e.year}: ${e.text}`).join('\n')}` : 'The globe\'s datasets record no wars, regime changes or crises for this period.',
        figures.length ? `Figures from the globe's datasets:\n${figures.map((f) => `- ${f}`).join('\n')}` : '',
        'Write 3 to 5 plain sentences, no headings or bullet points. Be factual. If little is reliably known about this territory in this period, say so in one sentence instead of guessing.',
      ].filter(Boolean).join('\n\n');
      try {
        const { text } = await sample(prompt, { signal: ctl.signal, cache: { gcTime: 24 * 3600 * 1000 }, onText: ({ text: t }) => setState({ status: 'streaming', text: t }) });
        setState({ status: 'done', text });
      } catch (e) {
        if (e.code === 'cancelled') return;
        setState({ status: 'error', text: e.text ?? '', error: aiErrorText(e.code) });
      }
    }, 1200);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [key, available, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (available === false) {
    return <p className="rounded-lg bg-white/5 px-3 py-2 text-[11.5px] text-slate-400">AI summaries need the claude.ai version of this page.</p>;
  }
  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10.5px] font-medium tracking-wide text-slate-400 uppercase">Summary</span>
        <span className="rounded bg-sky-400/10 px-1.5 text-[10px] text-sky-200 ring-1 ring-sky-400/20">AI-written</span>
      </div>
      {(state.status === 'idle' || (state.status === 'thinking' && !state.text)) && <p className="text-[12.5px] text-slate-400">Writing a summary…</p>}
      {state.text && <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-slate-200">{state.text}</p>}
      {state.error && <p className="mt-1 text-[11.5px] text-amber-200/90">{state.error}</p>}
      {state.status === 'done' && <p className="mt-1.5 text-[10.5px] text-slate-500">Written by Claude from general knowledge and the figures listed below. It can be wrong.</p>}
    </div>
  );
}

const RULES = `You answer questions about an interactive globe of economic, financial, demographic and political history, 1600 to today.
Use the tools to look up the globe's own data before answering about a specific place or period: find_territory to get a code, list_metrics for what is available, get_series for values, get_events and get_trade for events and trade.
Quote figures from the tools with their year. When you explain causes or context beyond the data (for example what drove inflation), say plainly that this comes from your general knowledge.
If the globe has no data for something, say so. Keep answers short: a few short paragraphs at most, plain text, no tables.`;

function ChatPanel({ config, selection, stop, colorBy }) {
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [available, setAvailable] = useState(null);
  const ctlRef = useRef(null);
  const listRef = useRef(null);
  const entity = useEntity(config, selection);

  useEffect(() => {
    getSample().then((s) => setAvailable(Boolean(s)));
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  const tools = useMemo(() => buildTools(config), [config]);

  async function send(e) {
    e.preventDefault();
    const q = draft.trim();
    if (!q || busy) return;
    const sample = await getSample();
    if (!sample) return;
    setDraft('');
    setNote(null);
    const context = `Current view: year ${stop}${entity ? `, selected territory ${entity.name}${entity.code ? ` (code ${entity.code})` : ''}` : ', nothing selected'}${colorBy ? `, map colored by ${config.metricsById[colorBy]?.name}` : ''}.`;
    const history = [...turns, { role: 'user', content: q }];
    setTurns([...history, { role: 'assistant', content: '', pending: true }]);
    setBusy(true);
    const ctl = new AbortController();
    ctlRef.current = ctl;
    const input = [{ role: 'user', content: `${RULES}\n\n${context}` }, ...history.slice(-12).map(({ role, content }) => ({ role, content }))];
    const limits = await sample.limits().catch(() => null);
    try {
      // Tools and a cache setting cannot be combined; without tools, turn the replay cache off.
      const opts = { signal: ctl.signal, onText: ({ text: t }) => setTurns([...history, { role: 'assistant', content: t, pending: true }]) };
      if (limits?.tools) opts.tools = tools;
      else opts.cache = false;
      const { text } = await sample(input, opts);
      setTurns([...history, { role: 'assistant', content: text }]);
    } catch (err) {
      const kept = err.text ?? '';
      setTurns(kept ? [...history, { role: 'assistant', content: kept }] : history);
      const msg = aiErrorText(err.code);
      if (msg) setNote(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-3 pb-2">
        <h2 className="text-[13px] font-semibold tracking-wide text-slate-100">Ask about the globe</h2>
        <p className="text-[11px] text-slate-500">For example: what drove Morocco's inflation between 2005 and 2012?</p>
      </div>
      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-2" aria-live="polite">
        {available === false && <p className="rounded-lg bg-white/5 px-3 py-2 text-[11.5px] text-slate-400">The chat needs the claude.ai version of this page.</p>}
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'ml-6 rounded-lg bg-sky-400/10 px-3 py-2 text-[12.5px] text-sky-50' : 'mr-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap text-slate-200 ring-1 ring-white/10'}>
            {t.content || (t.pending ? 'Thinking…' : '')}
          </div>
        ))}
        {note && <p className="text-[11.5px] text-amber-200/90">{note}</p>}
      </div>
      <form onSubmit={send} className="flex shrink-0 gap-2 border-t border-white/10 p-3">
        <label htmlFor="chat-input" className="sr-only">Question</label>
        <input
          id="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={available === false}
          placeholder={entity ? `Ask about ${entity.name}…` : 'Ask about any country or year…'}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-[13px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400/60"
        />
        {busy ? (
          <button type="button" onClick={() => ctlRef.current?.abort()} className="rounded-lg px-3 text-[13px] text-slate-200 ring-1 ring-white/15 hover:bg-white/10">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim() || available === false} className="rounded-lg bg-sky-500/80 px-3 text-[13px] font-medium text-white hover:bg-sky-500 disabled:opacity-40">
            Ask
          </button>
        )}
      </form>
      <p className="shrink-0 px-4 pb-3 text-[10.5px] text-slate-500">Answers by Claude. Figures come from the globe's data; explanations of causes are Claude's general knowledge and can be wrong.</p>
    </div>
  );
}

// Page functions Claude may call to read the globe's data.
function buildTools(config) {
  const { countries, entities, metrics, metricsById, tradeIndex } = config;
  const findCode = (q) => {
    const s = String(q ?? '').trim().toLowerCase();
    if (!s) return [];
    const out = [];
    for (const [code, c] of Object.entries(countries)) if (code.toLowerCase() === s || c.name.toLowerCase().includes(s)) out.push({ code, name: c.name, kind: 'country' });
    for (const [code, h] of Object.entries(entities.historical)) if (code.toLowerCase() === s || h.name.toLowerCase().includes(s)) out.push({ code, name: h.name, kind: 'historical state', from: h.from, to: h.to });
    for (const [alias, v] of Object.entries(entities.aliases)) if (typeof v === 'string' && alias.toLowerCase().includes(s)) out.push({ code: v, name: alias, kind: 'map name' });
    return out.slice(0, 10);
  };
  return [
    {
      name: 'find_territory',
      description: 'Find the globe code of a country, historical state or old map name (e.g. "Morocco", "Persia", "USSR"). Returns up to 10 matches with code, name and kind.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      execute: ({ name }) => findCode(name),
    },
    {
      name: 'list_metrics',
      description: 'List every measure on the globe: id, name, unit, category and the years it covers.',
      execute: () => metrics.filter((m) => m.loader?.type !== 'borders').map((m) => ({ id: m.id, name: m.name, unit: m.unit, category: m.category, years: `${m.firstYear}-${m.lastYear}` })),
    },
    {
      name: 'get_series',
      description: 'Values of one measure for one territory code, by year, optionally between from and to. Returns name, unit, source and values.',
      inputSchema: { type: 'object', properties: { code: { type: 'string' }, metric: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' } }, required: ['code', 'metric'] },
      execute: async ({ code, metric, from, to }) => {
        const m = metricsById[String(metric)];
        if (!m) throw new Error(`Unknown measure ${metric}. Use list_metrics.`);
        const bundle = await loadEntity(String(code).toUpperCase());
        const years = bundle[m.id];
        if (!years) return { code, metric: m.name, values: {}, note: 'No data for this territory.' };
        const lo = Number(from) || -Infinity;
        const hi = Number(to) || Infinity;
        const values = Object.fromEntries(Object.entries(years).filter(([y]) => Number(y) >= lo && Number(y) <= hi).slice(-250));
        return { code, metric: m.name, unit: m.unit, source: m.source, values };
      },
    },
    {
      name: 'get_events',
      description: 'Events recorded in the datasets (wars, regime changes, banking crises, extreme inflation, deep recessions) for a territory code between from and to.',
      inputSchema: { type: 'object', properties: { code: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' } }, required: ['code', 'from', 'to'] },
      execute: async ({ code, from, to }) => {
        const c = String(code).toUpperCase();
        const bundle = await loadEntity(c);
        const entity = describeEntity(c, config, c);
        return dataEvents({ series: (id) => bundle[id], entity, from: Number(from), to: Number(to), metricsById });
      },
    },
    {
      name: 'get_trade',
      description: 'Top export and import products and partners for a territory code in one year, where the globe has them.',
      inputSchema: { type: 'object', properties: { code: { type: 'string' }, year: { type: 'number' } }, required: ['code', 'year'] },
      execute: async ({ code, year }) => (await loadTrade(tradeIndex, [String(code).toUpperCase()], Number(year))) ?? { note: 'No trade detail for that year.' },
    },
  ];
}

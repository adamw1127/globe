import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { splitTerms } from '../data/glossary.js';

// A word with a dotted underline that shows a short definition, like a
// Wikipedia link preview: on hover with a mouse, on tap with a finger. The
// card stays open while the pointer is over it, so its link can be clicked.
export function Term({ title, text, url, children, className = '' }) {
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const timer = useRef(null);
  const id = useId();

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current && setRect(ref.current.getBoundingClientRect()), 180);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRect(null), 160);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!rect) return;
    const close = (e) => !ref.current?.contains(e.target) && !document.getElementById(id)?.contains(e.target) && setRect(null);
    const onKey = (e) => e.key === 'Escape' && setRect(null);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, [rect, id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-describedby={rect ? id : undefined}
        aria-expanded={Boolean(rect)}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          clearTimeout(timer.current);
          setRect((r) => (r ? null : ref.current.getBoundingClientRect()));
        }}
        className={`cursor-help text-left underline decoration-slate-500 decoration-dotted underline-offset-[3px] hover:decoration-sky-300 ${className}`}
      >
        {children}
      </button>
      {rect && createPortal(<Card id={id} rect={rect} title={title} text={text} url={url} onEnter={show} onLeave={hide} />, document.body)}
    </>
  );
}

function Card({ id, rect, title, text, url, onEnter, onLeave }) {
  const width = Math.min(300, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const below = rect.bottom + 8 + 160 < window.innerHeight;
  const style = below ? { left, top: rect.bottom + 6, width } : { left, bottom: window.innerHeight - rect.top + 6, width };
  return (
    <div
      id={id}
      role="tooltip"
      style={style}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onLeave()}
      className="fixed z-[60] rounded-xl border border-white/15 bg-ink-800 px-3 py-2.5 text-left text-[12px] leading-relaxed text-slate-200 shadow-2xl"
    >
      {title && <div className="mb-0.5 text-[12.5px] font-semibold text-white">{title[0].toUpperCase() + title.slice(1)}</div>}
      <div>{text}</div>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[11.5px] text-sky-300 hover:underline">
          Read more on Wikipedia ↗
        </a>
      )}
    </div>
  );
}

// Text with known glossary terms turned into Terms (first occurrence each).
export function TermText({ text }) {
  return splitTerms(text).map((part, i) =>
    typeof part === 'string' ? (
      <span key={i}>{part}</span>
    ) : (
      <Term key={i} title={part.term} text={part.text} url={part.url}>
        {part.word}
      </Term>
    ),
  );
}

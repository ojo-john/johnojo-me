"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

interface Ctx {
  show: (key: string) => void;
  footnotes: string[];
}
const ReaderContext = createContext<Ctx>({ show: () => {}, footnotes: [] });

export interface PassageView {
  key: string;
  ref: string;
  text: string;
  url: string;
}

/**
 * Article chrome: reading progress, a table of contents that follows the reader, a scripture panel
 * that shows any reference the reader selects, footnote popovers, and an optional study mode.
 */
export function Reader({
  children,
  headings,
  passages,
  footnotes,
  minutes,
}: {
  children: React.ReactNode;
  headings: { id: string; text: string }[];
  passages: PassageView[];
  footnotes: string[];
  minutes: number;
}) {
  const [current, setCurrent] = useState<PassageView | null>(passages[0] ?? null);
  const [onHead, setOnHead] = useState<string | null>(null);
  const [study, setStudy] = useState(false);
  const [progress, setProgress] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = bodyRef.current?.getBoundingClientRect();
        if (r) setProgress(Math.min(1, Math.max(0, (window.innerHeight * 0.4 - r.top) / r.height)));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setOnHead(e.target.id)), { rootMargin: "-20% 0px -70% 0px" });
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [headings]);

  const show = (key: string) => {
    const p = passages.find((x) => x.key === key);
    if (!p) return;
    setCurrent(p);
    if (window.innerWidth <= 900) drawerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <ReaderContext.Provider value={{ show, footnotes }}>
      <div className="prog" aria-hidden="true">
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className={`wrap reader${study ? " study" : ""}`}>
        <nav className="toc" aria-label="In this piece">
          <span className="kicker" style={{ color: "var(--ink-2)", marginBottom: 6 }}>
            In this piece
          </span>
          {headings.map((h) => (
            <a key={h.id} href={`#${h.id}`} className={onHead === h.id ? "on" : undefined}>
              {h.text}
            </a>
          ))}
          <span className="mono" style={{ color: "var(--ink-2)", marginTop: 14 }}>
            {progress >= 0.98 ? "Finished" : `${Math.max(1, Math.ceil(minutes * (1 - progress)))} min left`}
          </span>
          <label className="study-toggle">
            <input type="checkbox" checked={study} onChange={(e) => setStudy(e.target.checked)} /> Study mode
          </label>
        </nav>
        <div className="prose" ref={bodyRef}>
          {children}
        </div>
        <aside className="drawer" aria-label="Scripture reference" ref={drawerRef}>
          {current ? (
            <div className="drawer-card" aria-live="polite">
              <span className="r">{current.ref} · WEB</span>
              <blockquote>{current.text}</blockquote>
              <a href={current.url} target="_blank" rel="noopener noreferrer">
                Read the passage<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className="missing" style={{ fontSize: 12.5 }}>
                Select a highlighted reference to show it here.
              </span>
            </div>
          ) : null}
        </aside>
      </div>
    </ReaderContext.Provider>
  );
}

/** Inline scripture reference: shows the passage in the side panel. */
export function Ref({ k, children }: { k: string; children?: React.ReactNode }) {
  const { show } = useContext(ReaderContext);
  return (
    <button className="ref" type="button" onClick={() => show(k)}>
      {children ?? k}
    </button>
  );
}

/** Footnote marker that opens its note inline. */
export function Fn({ n }: { n: number }) {
  const { footnotes } = useContext(ReaderContext);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="fn" type="button" aria-expanded={open} aria-label={`Note ${n}`} onClick={() => setOpen(!open)}>
        {n}
      </button>
      {open ? (
        <span className="fn-pop" role="note">
          {footnotes[n - 1]}
        </span>
      ) : null}
    </>
  );
}

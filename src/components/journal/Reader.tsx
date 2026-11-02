"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

interface Ctx {
  show: (key: string) => void;
  footnotes: string[];
  /** Study mode: every footnote open, and answer boxes under the study questions. */
  study: boolean;
}
const ReaderContext = createContext<Ctx>({ show: () => {}, footnotes: [], study: false });

export interface PassageView {
  key: string;
  ref: string;
  text: string;
  url: string;
}

/**
 * Article chrome: reading progress, a table of contents that follows the reader, a scripture panel
 * that shows any reference the reader selects, footnote popovers, and, on posts with study questions,
 * a study mode.
 */
export function Reader({
  children,
  headings,
  passages,
  footnotes,
  minutes,
  hasQuestions,
}: {
  children: React.ReactNode;
  headings: { id: string; text: string }[];
  passages: PassageView[];
  footnotes: string[];
  minutes: number;
  /** Study mode only exists for posts with study questions; elsewhere it would change nothing. */
  hasQuestions: boolean;
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
    <ReaderContext.Provider value={{ show, footnotes, study }}>
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
          {hasQuestions ? (
            <>
              <label className="study-toggle">
                <input type="checkbox" checked={study} onChange={(e) => setStudy(e.target.checked)} /> Study mode
              </label>
              {study ? (
                <p className="study-hint" aria-live="polite">
                  Notes are open, and the study questions have space for your answers. <a href="#qh">Jump to the questions</a>
                </p>
              ) : null}
            </>
          ) : null}
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
  const { footnotes, study } = useContext(ReaderContext);
  const [toggled, setToggled] = useState(false);
  // Study mode opens every note; the marker still closes one while studying.
  const open = study ? !toggled : toggled;
  return (
    <>
      <button className="fn" type="button" aria-expanded={open} aria-label={`Note ${n}`} onClick={() => setToggled(!toggled)}>
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

/** Answers are kept in this browser only (never sent anywhere), one per post and question. */
const answerKey = (slug: string, i: number) => `study:${slug}:${i}`;

function readAnswer(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    // Private windows and blocked storage: the box still works, it just won't remember.
    return "";
  }
}

function Answer({ id, storageKey }: { id: string; storageKey: string }) {
  // Only mounted in study mode, after the page has loaded, so reading storage here can't mismatch the server HTML.
  const [value, setValue] = useState(() => readAnswer(storageKey));
  const save = (v: string) => {
    setValue(v);
    try {
      localStorage.setItem(storageKey, v);
    } catch {
      // Not saved; the text stays in the box for this visit.
    }
  };
  return <textarea id={id} value={value} onChange={(e) => save(e.target.value)} placeholder="Your answer is saved in this browser only." />;
}

/** The questions at the end of a study post; in study mode each gets an answer box. */
export function StudyQuestions({ slug, questions }: { slug: string; questions: string[] }) {
  const { study } = useContext(ReaderContext);
  return (
    <section className="card qs" aria-labelledby="qh">
      <h2 id="qh">Study questions</h2>
      <ol>
        {questions.map((q, i) => (
          <li key={q}>
            <label htmlFor={`q${i}`}>{q}</label>
            {study ? <Answer id={`q${i}`} storageKey={answerKey(slug, i)} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

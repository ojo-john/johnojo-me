"use client";

import { useEffect, useRef, useState } from "react";

export interface Milestone {
  date: string;
  label: string;
  title: string;
  detail: string;
  body?: string;
}

/** Proportional career line from the first milestone to today; select a milestone for details. */
export function CareerTimeline({ milestones, today, currentTitle }: { milestones: Milestone[]; today: string; currentTitle: string }) {
  const [sel, setSel] = useState<number | "now">(milestones.length - 1);
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const t0 = Date.parse(milestones[0].date.length === 7 ? `${milestones[0].date}-01` : milestones[0].date);
  const t1 = Date.parse(today);
  const pct = (d: string) => (((Date.parse(d.length === 7 ? `${d}-01` : d) - t0) / (t1 - t0)) * 100).toFixed(2);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setDrawn(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setDrawn(true), io.disconnect()));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const m = sel === "now" ? null : milestones[sel];
  const todayLabel = new Date(today).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return (
    <>
      <div ref={ref} className={`ctl${drawn ? " in" : ""}`}>
        <div className="axis">
          <span className="span" />
          {milestones.map((ms, i) => (
            <button key={ms.date} className="pt" type="button" style={{ left: `${pct(ms.date)}%` }} aria-pressed={sel === i} aria-label={`${ms.label}: ${ms.title}`} onClick={() => setSel(i)} />
          ))}
          <button className="pt now" type="button" style={{ left: "100%" }} aria-pressed={sel === "now"} aria-label={`Now: ${todayLabel}`} onClick={() => setSel("now")} />
        </div>
        <div className="lbls" aria-hidden="true">
          {milestones.map((ms) => (
            <span key={ms.date} style={{ left: `${pct(ms.date)}%` }}>
              {ms.label}
            </span>
          ))}
          <span style={{ left: "100%" }}>Now</span>
        </div>
      </div>
      <div className="card ctl-card" aria-live="polite">
        {m ? (
          <>
            <h3>{m.title}</h3>
            <span className="mono">
              {m.label} · {m.detail}
            </span>
            {m.body ? <p style={{ flexBasis: "100%" }}>{m.body}</p> : null}
          </>
        ) : (
          <>
            <h3>Now</h3>
            <span className="mono">
              {todayLabel} · {currentTitle}
            </span>
          </>
        )}
      </div>
    </>
  );
}

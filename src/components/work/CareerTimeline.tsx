"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { ExperienceYear } from "@/lib/content/experience-years";

/** Minimum horizontal gap (as % of the line) before a milestone label moves above the line. */
const LABEL_GAP_PCT = 22;

export interface Milestone {
  date: string;
  label: string;
  title: string;
  detail: string;
  body?: string;
}

/**
 * Proportional career line from the first milestone to today. Pick a year (or a point on the line) to
 * see that year's milestones and everything I worked on during it.
 */
export function CareerTimeline({ milestones, years, today }: { milestones: Milestone[]; years: ExperienceYear[]; today: string }) {
  const [year, setYear] = useState(years.at(-1)?.year ?? new Date(today).getFullYear());
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const drawn = useReducedMotion() || seen;
  const t0 = Date.parse(milestones[0].date.length === 7 ? `${milestones[0].date}-01` : milestones[0].date);
  const t1 = Date.parse(today);
  const pct = (d: string) => (((Date.parse(d.length === 7 ? `${d}-01` : d) - t0) / (t1 - t0)) * 100).toFixed(2);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shown = years.find((y) => y.year === year);
  // A label too close to the previous one (on the same side) moves above the line, so labels alternate
  // instead of overlapping on phones.
  const labelUp = milestones.reduce<boolean[]>((up, ms, i) => {
    const close = i > 0 && Number(pct(ms.date)) - Number(pct(milestones[i - 1].date)) < LABEL_GAP_PCT;
    return [...up, close && !up[i - 1]];
  }, []);
  const todayLabel = new Date(today).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return (
    <>
      <div ref={ref} className={`ctl${drawn ? " in" : ""}`}>
        <div className="axis">
          <span className="span" />
          {milestones.map((ms) => (
            <button key={ms.date} className="pt" type="button" style={{ left: `${pct(ms.date)}%` }} aria-pressed={year === Number(ms.date.slice(0, 4))} aria-label={`${ms.label}: ${ms.title}`} onClick={() => setYear(Number(ms.date.slice(0, 4)))} />
          ))}
          <button className="pt now" type="button" style={{ left: "100%" }} aria-pressed={false} aria-label={`Now: ${todayLabel}`} onClick={() => setYear(years.at(-1)?.year ?? year)} />
        </div>
        <div className="lbls" aria-hidden="true">
          {milestones.map((ms, i) => (
            <span key={ms.date} className={labelUp[i] ? "up" : undefined} style={{ left: `${pct(ms.date)}%` }}>
              {ms.label}
            </span>
          ))}
          <span style={{ left: "100%" }}>Now</span>
        </div>
      </div>
      <div className="ctl-years" role="group" aria-label="Show a year">
        {years.map((y) => (
          <button key={y.year} type="button" aria-pressed={y.year === year} onClick={() => setYear(y.year)}>
            {y.year}
          </button>
        ))}
      </div>
      <div className="card ctl-card" aria-live="polite">
        <h3>{year}</h3>
        {shown && shown.milestones.length + shown.work.length > 0 ? (
          <>
            {shown.milestones.map((m) => (
              <div key={m.title} className="ctl-ms">
                <b>{m.title}</b>
                <span className="mono">
                  {m.label} · {m.detail}
                </span>
              </div>
            ))}
            {shown.work.map((w) => (
              <div key={w.role + w.title} className="ctl-work">
                <h4>{w.title}</h4>
                <span className="mono">
                  {w.org} · {w.role} · {w.dates}
                </span>
                <ul>
                  {w.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        ) : (
          <p className="missing">Nothing recorded for this year.</p>
        )}
      </div>
    </>
  );
}

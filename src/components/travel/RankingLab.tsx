"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AGGREGATION_LABEL, aggregate, rank, type Aggregation } from "@/lib/content/ranking";
import { CATEGORIES } from "@/lib/content/categories";
import type { VisitView } from "./types";

type Tab = "list" | "compare" | "then-now";

/**
 * Rankings from the owner's real scores only. Unrated or partly rated visits are listed separately
 * and never placed in the ranked order. On the all-time view, repeat visits to a city collapse
 * using the chosen aggregation, which is always named on screen.
 */
export function RankingLab({ visits, scope, allVisits }: { visits: VisitView[]; scope: "trip" | "all"; allVisits?: VisitView[] }) {
  const [tab, setTab] = useState<Tab>("list");
  const [mode, setMode] = useState<Aggregation>("latest");
  // Match days and stops left unscored on purpose aren't ranked as cities.
  const rateable = visits.filter((v) => v.kind !== "match-only" && !v.notRanked);

  const rows = useMemo(() => {
    if (scope === "trip") return rateable.map((v) => ({ id: v.id, label: v.city, sub: v.tripTitle, total: v.score.total, v }));
    const byPlace = new Map<string, VisitView[]>();
    for (const v of rateable) byPlace.set(v.destination, [...(byPlace.get(v.destination) ?? []), v]);
    return [...byPlace.values()].map((vs) => {
      const latest = [...vs].sort((a, b) => b.year - a.year)[0];
      const total = aggregate(vs.map((x) => ({ visitId: x.id, date: String(x.year), total: x.score.total })), mode);
      return { id: latest.destination, label: latest.city, sub: vs.length > 1 ? `${vs.length} visits` : latest.tripTitle, total, v: latest };
    });
  }, [rateable, scope, mode]);

  const { ranked, unranked } = rank(rows);
  const repeat = useMemo(() => {
    const pool = (allVisits ?? visits).filter((v) => v.kind !== "match-only" && !v.notRanked);
    const by = new Map<string, VisitView[]>();
    for (const v of pool) by.set(v.destination, [...(by.get(v.destination) ?? []), v]);
    return [...by.values()].filter((vs) => vs.length > 1).map((vs) => [...vs].sort((a, b) => a.year - b.year));
  }, [allVisits, visits]);

  return (
    <section className="wrap lab" id="rankings" aria-labelledby="lab-h">
      <div className="lab-head">
        <div>
          <span className="kicker" style={{ color: "var(--ink-2)" }}>
            Scorecard · 10 categories · 100 points
          </span>
          <h2 id="lab-h" style={{ marginTop: 8 }}>
            {scope === "trip" ? "My rankings" : "All-time rankings"}
          </h2>
        </div>
        <div className="tabs" role="tablist" aria-label="Ranking view">
          {(
            [
              ["list", "Rankings"],
              ["compare", "Compare"],
              ["then-now", "Then vs now"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" type="button" data-track={`rankings: ${k}`} aria-selected={tab === k} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {tab === "list" ? (
        <div style={{ marginTop: 28 }}>
          {scope === "all" ? (
            <div className="tabs" role="group" aria-label="How repeat visits count" style={{ marginBottom: 14 }}>
              {(Object.keys(AGGREGATION_LABEL) as Aggregation[]).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {AGGREGATION_LABEL[m]}
                </button>
              ))}
            </div>
          ) : null}
          <Board ranked={ranked} unranked={unranked} />
          {scope === "all" ? <p className="method">Repeat visits counted by: {AGGREGATION_LABEL[mode].toLowerCase()}.</p> : null}
        </div>
      ) : tab === "compare" ? (
        <Compare visits={scope === "trip" ? rateable : rows.map((r) => r.v)} />
      ) : (
        <ThenNow groups={repeat} />
      )}
      <p className="method">
        Method v1: ten categories scored 0–10 with equal weights. A city is ranked only once all ten are scored; an unrated category is never counted as zero. Ties share a rank. Match-day stops aren&apos;t ranked as cities.
      </p>
    </section>
  );
}

type Row = { id: string; label: string; sub: string; total: number | null; v: VisitView };

function Board({ ranked, unranked }: { ranked: (Row & { rank: number })[]; unranked: Row[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!ranked.length && !unranked.length) return <p className="card empty">No cities on this trip yet.</p>;
  return (
    <div className="card board">
      {ranked.map((r) => (
        <BoardRow key={r.id} r={r} rankLabel={String(r.rank)} open={open === r.id} toggle={() => setOpen(open === r.id ? null : r.id)} />
      ))}
      {unranked.map((r) => (
        <BoardRow key={r.id} r={r} rankLabel="—" open={open === r.id} toggle={() => setOpen(open === r.id ? null : r.id)} />
      ))}
    </div>
  );
}

function BoardRow({ r, rankLabel, open, toggle }: { r: Row; rankLabel: string; open: boolean; toggle: () => void }) {
  const st = r.v.score;
  return (
    <>
      <button className="r" type="button" aria-expanded={open} onClick={toggle}>
        <span className="rk">{rankLabel}</span>
        <span>
          <b>{r.label}</b>
          <br />
          <span className="st">
            {r.sub} · {st.state === "complete" ? "all ten rated" : st.state === "incomplete" ? `incomplete · ${st.rated}/10` : "not yet rated"}
          </span>
        </span>
        <span className="tot">{r.total !== null ? `${r.total}/100` : "—"}</span>
      </button>
      {open ? (
        <div className="bd">
          {CATEGORIES.map((c) => (
            <Cat key={c.key} label={c.label} value={r.v.scores[c.key]} />
          ))}
          {r.v.verdict ? <p style={{ gridColumn: "1 / -1", fontFamily: "var(--f-read)" }}>Verdict: {r.v.verdict}</p> : null}
        </div>
      ) : null}
    </>
  );
}

function Cat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <span>{label}</span>
      <span style={{ textAlign: "right" }}>{value ?? "—"}</span>
      <Bar v={value !== null ? value / 10 : 0} />
    </div>
  );
}

/** Bars grow from zero on first view; they're readable immediately under reduced motion. */
function Bar({ v, side }: { v: number; side?: "l" | "r" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(v));
    return () => cancelAnimationFrame(id);
  }, [v]);
  return (
    <span ref={ref} className={`bar${side ? ` ${side}` : ""}`}>
      <i style={{ ["--v" as string]: shown }} />
    </span>
  );
}

function Compare({ visits }: { visits: VisitView[] }) {
  const [a, setA] = useState(visits[0]?.id);
  const [b, setB] = useState(visits[1]?.id ?? visits[0]?.id);
  if (visits.length < 2) return <p className="card empty" style={{ marginTop: 28 }}>Comparison needs at least two cities.</p>;
  const va = visits.find((v) => v.id === a) ?? visits[0];
  const vb = visits.find((v) => v.id === b) ?? visits[1];
  const label = (v: VisitView) => (visits.filter((x) => x.city === v.city).length > 1 ? `${v.city} (${v.year})` : v.city);
  return (
    <div className="card compare" style={{ marginTop: 28 }}>
      <div className="cmp-pick">
        <label className="sr-only" htmlFor="cmp-a">First city</label>
        <select id="cmp-a" value={va.id} onChange={(e) => setA(e.target.value)}>
          {visits.map((v) => (
            <option key={v.id} value={v.id}>
              {label(v)}
            </option>
          ))}
        </select>
        <span className="vs">vs</span>
        <label className="sr-only" htmlFor="cmp-b">Second city</label>
        <select id="cmp-b" value={vb.id} onChange={(e) => setB(e.target.value)}>
          {visits.map((v) => (
            <option key={v.id} value={v.id}>
              {label(v)}
            </option>
          ))}
        </select>
      </div>
      <div className="cmp-rows">
        {CATEGORIES.map((c) => {
          const x = va.scores[c.key], y = vb.scores[c.key];
          return (
            <div className="cmp-row" key={c.key}>
              <span style={{ position: "relative" }}>
                <Bar side="l" v={x !== null ? x / 10 : 0} />
                {x === null ? <span className="nr">not rated</span> : null}
              </span>
              <span className="lbl">
                {c.label}
                <br />
                <span className="mono">
                  {x ?? "—"} · {y ?? "—"}
                </span>
              </span>
              <span style={{ position: "relative" }}>
                <Bar side="r" v={y !== null ? y / 10 : 0} />
                {y === null ? <span className="nr">not rated</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThenNow({ groups }: { groups: VisitView[][] }) {
  if (!groups.length) return <p className="card empty" style={{ marginTop: 28 }}>When you visit a city more than once, its visits are compared here side by side.</p>;
  return (
    <div style={{ display: "grid", gap: 16, marginTop: 28 }}>
      {groups.map((vs) => (
        <div key={vs[0].destination} className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 30 }}>{vs[0].city}</h3>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${vs.length}, minmax(0, 1fr))`, gap: 12, marginTop: 12 }}>
            {vs.map((v, i) => {
              const prev = vs[i - 1];
              const delta = prev && v.score.total !== null && prev.score.total !== null ? v.score.total - prev.score.total : null;
              return (
                <div key={v.id} style={{ borderTop: "2px solid var(--ink)", paddingTop: 10 }}>
                  <span className="kicker">{v.tripTitle}</span>
                  <p style={{ fontFamily: "var(--f-display)", fontWeight: 800, fontSize: 24 }}>{v.score.total !== null ? `${v.score.total}/100` : "Not yet rated"}</p>
                  {delta !== null ? <p className="mono">{delta >= 0 ? `+${delta}` : delta} since {prev.year}</p> : null}
                  {v.verdict ? <p style={{ fontFamily: "var(--f-read)", marginTop: 6 }}>{v.verdict}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Picture } from "@/components/Picture";
import type { MapGeometry } from "@/lib/geo";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Lightbox, useLightbox } from "./Lightbox";
import type { VisitView } from "./types";
import { ClipPlayer, YouTube } from "./Video";

const ZOOM = 1.6;
const KIND_LABEL = { city: null, "match-only": "Match day", "day-trip": "Day trip" } as const;

/**
 * Sticky map beside the city stories. Scrolling a story into view highlights and centres its pin;
 * selecting a pin scrolls to its story. The story list doubles as the map's text alternative.
 */
/** Pin and text sizes in map units (the desktop look), and the smallest each may appear on screen, in px. */
const PIN_R = 14;
const NUMBER_SIZE = 15;
const LABEL_SIZE = 17;
const MIN_PIN_PX = 11;
const MIN_NUMBER_PX = 12;
const MIN_LABEL_PX = 13;

export function TripExplorer({ visits, map }: { visits: VisitView[]; map: MapGeometry }) {
  const [active, setActive] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const reducedMotion = useReducedMotion();
  const drawn = reducedMotion || seen;
  const mapRef = useRef<HTMLDivElement>(null);
  // Map units per on-screen pixel. The map is drawn at a fixed size and scaled to fit, so on a phone a
  // 14-unit pin would be ~6px; pins and labels grow with this so they never drop below a readable size.
  const [unitsPerPx, setUnitsPerPx] = useState(1);
  useEffect(() => {
    const svg = mapRef.current?.querySelector("svg");
    if (!svg) return;
    const measure = () => svg.clientWidth > 0 && setUnitsPerPx(map.width / svg.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [map.width]);
  const pinR = Math.max(PIN_R, MIN_PIN_PX * unitsPerPx);
  const numberSize = Math.max(NUMBER_SIZE, MIN_NUMBER_PX * unitsPerPx);
  const labelSize = Math.max(LABEL_SIZE, MIN_LABEL_PX * unitsPerPx);
  const lb = useLightbox();
  const pins = new Map(map.points.map((p) => [p.id, p]));
  const route = visits.map((v) => pins.get(v.slug)).filter(Boolean) as MapGeometry["points"];

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive((e.target as HTMLElement).dataset.city ?? null)), {
      rootMargin: "-40% 0px -50% 0px",
    });
    document.querySelectorAll<HTMLElement>("[data-city]").forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  const jump = useCallback((slug: string) => {
    setActive(slug);
    document.getElementById(slug)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }, [reducedMotion]);

  const focus = active ? pins.get(active) : null;
  const camera = focus ? `translate(${(map.width / 2 - focus.x * ZOOM).toFixed(1)}px, ${(map.height / 2 - focus.y * ZOOM).toFixed(1)}px) scale(${ZOOM})` : undefined;

  return (
    <div className="explore">
      <div className="map-col">
        <div ref={mapRef} className={`bigmap${drawn ? " in" : ""}`}>
          <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={`Route map: ${route.map((p) => p.label).join(", ")}. Each pin jumps to its city below.`}>
            <g className="cam" style={{ transform: camera }}>
              <path className="land" d={map.land} />
              {route.length > 1 ? <path className="rt" d={"M" + route.map((p) => `${p.x} ${p.y}`).join(" L")} /> : null}
              {visits.map((v) => {
                const p = pins.get(v.slug);
                if (!p) return null;
                return (
                  <g
                    key={v.slug}
                    className={`pin${active === v.slug ? " act" : ""}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${v.number}. ${v.city}`}
                    data-track={`city: ${v.slug}`}
                    onClick={() => jump(v.slug)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), jump(v.slug))}
                  >
                    <circle cx={p.x} cy={p.y} r={pinR} strokeWidth={Math.max(3, pinR / 5)} />
                    <text x={p.x} y={p.y} style={{ fontSize: numberSize }}>
                      {v.number}
                    </text>
                    <text className="lbl" x={p.x + pinR + 8} y={p.y} style={{ fontSize: labelSize }}>
                      {v.city}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="map-legend">
          <span>Pins mark city centres. Select one to jump to that stop.</span>
          <button type="button" onClick={() => setActive(null)}>
            Reset view
          </button>
        </div>
      </div>

      <div className="cities">
        {visits.map((v) => (
          <article key={v.slug} id={v.slug} className={`card ccard${active === v.slug ? " act" : ""}`} data-city={v.slug} aria-labelledby={`h-${v.slug}`}>
            <div className="hd">
              <span className="no">{v.number}</span>
              <div>
                <h3 id={`h-${v.slug}`}>{v.city}</h3>
                <span className="sub">
                  {v.country}
                  {v.dates ? ` · ${v.dates}` : ""}
                </span>
              </div>
              {KIND_LABEL[v.kind] ? <span className="flag muted">{KIND_LABEL[v.kind]}</span> : null}
            </div>

            {v.cover ? (
              <button type="button" className="cover" data-track="lightbox: open" style={{ padding: 0, cursor: "zoom-in", background: "none" }} onClick={() => lb.open(v.photos, Math.max(0, v.photos.findIndex((p) => p.id === v.cover?.id)))} aria-label={`Open photo: ${v.cover.caption ?? v.city}`}>
                <Picture photo={v.cover} sizes="(max-width: 900px) 100vw, 45vw" />
              </button>
            ) : null}

            {v.matches.map((m) => (
              <div key={`${m.home}-${m.away}-${m.date}`} className="matchbox">
                <span className="kicker">{[m.competition, m.stadium].filter(Boolean).join(" · ") || "Match"}</span>
                <span className="fixture">
                  {m.home} {m.score ?? "v"} {m.away}
                </span>
                {m.writeUp ? <p style={{ fontFamily: "var(--f-read)", fontSize: 17.5 }}>{m.writeUp}</p> : null}
              </div>
            ))}
            {v.kind === "match-only" && v.matches.length === 0 ? <p className="missing">Match details coming soon.</p> : null}

            {v.summary ? <p className="sum">{v.summary}</p> : v.kind === "city" && v.highlights.length === 0 ? <p className="missing">Notes coming.</p> : null}

            {v.highlights.length ? (
              <div className="hlchips">
                {v.highlights.map(([k, val]) => (
                  <span key={k}>
                    <b>{k}</b>
                    {val}
                  </span>
                ))}
              </div>
            ) : null}

            {v.liked || v.disliked ? (
              <div className="ld">
                {v.liked ? (
                  <div>
                    <b>Liked</b>
                    {v.liked}
                  </div>
                ) : null}
                {v.disliked ? (
                  <div>
                    <b>Didn&apos;t</b>
                    {v.disliked}
                  </div>
                ) : null}
              </div>
            ) : null}

            {v.videos.length === 1 ? (
              <ClipPlayer clip={v.videos[0]} label={v.videos[0].caption ?? `Clip from ${v.city}`} />
            ) : v.videos.length > 1 ? (
              <div className="clips" role="group" aria-label={`${v.videos.length} clips from ${v.city}`}>
                {v.videos.map((clip, i) => (
                  <button key={clip.id} type="button" data-track="clip: open" onClick={() => lb.open(v.videos, i)} aria-label={`Play clip ${i + 1}: ${clip.caption ?? v.city}`}>
                    {clip.type === "video" && clip.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element -- poster generated by scripts/media.ts
                      <img src={clip.poster} alt="" loading="lazy" width={clip.w} height={clip.h} />
                    ) : null}
                    <span aria-hidden="true">▶</span>
                  </button>
                ))}
              </div>
            ) : null}
            {v.youtube.map((y) => (
              <YouTube key={y.id} id={y.id} title={y.title} />
            ))}

            {v.photos.length || v.kind === "city" ? (
              <div className="crow">
                <div className="thumbs">
                  {v.photos.map((p, i) => (
                    <button key={p.id} type="button" data-track="lightbox: open" onClick={() => lb.open(v.photos, i)} aria-label={`Open photo: ${p.caption ?? p.alt}`}>
                      <Picture photo={{ ...p, alt: "" }} sizes="64px" />
                    </button>
                  ))}
                </div>
                {v.kind !== "match-only" ? <Score v={v} /> : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <Lightbox lb={lb} />
    </div>
  );
}

function Score({ v }: { v: VisitView }) {
  const c = 2 * Math.PI * 18;
  const total = v.score.total;
  return (
    <div className="score-ring">
      <svg viewBox="0 0 46 46" aria-hidden="true">
        <circle className="bgc" cx="23" cy="23" r="18" />
        {total !== null ? <circle className="val" cx="23" cy="23" r="18" strokeDasharray={`${(total / 100) * c} ${c}`} /> : null}
      </svg>
      <span>
        <b>{total !== null ? `${total} / 100` : v.score.state === "incomplete" ? `Incomplete · ${v.score.rated}/10` : "Not yet rated"}</b>
        <br />
        <span className="missing">
          Would I return? {v.wouldReturn ? `${v.wouldReturn.answer[0].toUpperCase()}${v.wouldReturn.answer.slice(1)}${v.wouldReturn.why ? `: ${v.wouldReturn.why}` : ""}` : "Not answered yet"}
        </span>
      </span>
    </div>
  );
}

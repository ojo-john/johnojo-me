"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Picture } from "@/components/Picture";
import type { MapGeometry } from "@/lib/geo";
import { placeLabels } from "@/lib/label-place";
import { nearestGap, spreadPins } from "@/lib/pin-spread";
import { usePanZoom } from "@/lib/usePanZoom";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Gallery } from "./Gallery";
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
/** Space kept between neighbouring pins once a crowd is fanned out. */
const PIN_GAP = 6;
const NUMBER_SIZE = 15;
const LABEL_SIZE = 17;
const MIN_PIN_PX = 11;
const MIN_NUMBER_PX = 12;
const MIN_LABEL_PX = 13;
/** Each pin's tap target is at least this wide on screen (WCAG 2.2 asks for 24px; 44px is comfortable). */
const MIN_HIT_PX = 44;
/** Below this width the map stops being sticky (see globals.css), so it shows the whole route instead of zooming. */
const STACKED_QUERY = "(max-width: 900px)";
/** How far a pin really reaches, as a share of its radius: the thick outline plus the 1.2x grow when selected. */
const PIN_FOOTPRINT = 1.45;
/** Clear space between a pin and its name, in on-screen px. */
const LABEL_GAP_PX = 6;

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
  const svgRef = useRef<SVGSVGElement>(null);
  const pz = usePanZoom(svgRef, map.width, map.height);
  // Sizes are in map units; multiplying by pz.scale keeps them the same on screen as the map zooms.
  const pinR = Math.max(PIN_R, MIN_PIN_PX * unitsPerPx) * pz.scale;
  const hitR = Math.max(pinR, (MIN_HIT_PX / 2) * unitsPerPx * pz.scale);
  // On a phone the map sits above the stories rather than beside them, so following the reader with a
  // zoom would only push other pins off the edge. It stays zoomed out there.
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(STACKED_QUERY);
    const update = () => setStacked(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const numberSize = Math.max(NUMBER_SIZE, MIN_NUMBER_PX * unitsPerPx) * pz.scale;
  const labelSize = Math.max(LABEL_SIZE, MIN_LABEL_PX * unitsPerPx) * pz.scale;
  const lb = useLightbox();
  const pins = new Map(map.points.map((p) => [p.id, p]));
  // Crowded stops (Bruges, Ghent, Brussels) fan out so every number stays readable and tappable.
  const placed = new Map(spreadPins(map.points, 2 * pinR + PIN_GAP).map((p) => [p.id, p]));
  // Each city name goes on the side of its pin that's clear of other pins and names.
  const names = new Map(visits.map((v) => [v.slug, v.city]));
  const labels = new Map(
    placeLabels(
      [...placed.values()].map((p) => ({ id: p.id, x: p.px, y: p.py, label: names.get(p.id) ?? p.id })),
      { pinR: pinR * PIN_FOOTPRINT, fontSize: labelSize, gap: LABEL_GAP_PX * pz.scale * unitsPerPx, bounds: { x0: pz.view.x, y0: pz.view.y, x1: pz.view.x + pz.view.w, y1: pz.view.y + pz.view.h } },
    ).map((l) => [l.id, l]),
  );
  const hitFor = (id: string) => Math.min(hitR, nearestGap([...placed.values()], id) / 2);
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

  const focus = active && !stacked ? pins.get(active) : null;
  const camera = focus ? `translate(${(map.width / 2 - focus.x * ZOOM).toFixed(1)}px, ${(map.height / 2 - focus.y * ZOOM).toFixed(1)}px) scale(${ZOOM})` : undefined;

  return (
    <div className="explore">
      <div className="map-col">
        <div ref={mapRef} className={`bigmap${drawn ? " in" : ""}`}>
          <svg ref={svgRef} viewBox={pz.viewBox} style={{ touchAction: pz.touchAction }} role="group" aria-label={`Route map: ${route.map((p) => p.label).join(", ")}. Each pin jumps to its city below.`}>
            <g className="cam" style={{ transform: camera }}>
              <path className="land" d={map.land} />
              {route.length > 1 ? <path className="rt" d={"M" + route.map((p) => `${p.x} ${p.y}`).join(" L")} /> : null}
              {/* A moved pin keeps a thin line and dot back to the city's true position. */}
              {[...placed.values()].filter((p) => p.moved).map((p) => (
                <g key={`lead-${p.id}`} className="lead" aria-hidden="true">
                  <line x1={p.x} y1={p.y} x2={p.px} y2={p.py} strokeWidth={Math.max(1.5, pinR / 9)} />
                  <circle cx={p.x} cy={p.y} r={Math.max(3, pinR / 4)} />
                </g>
              ))}
              {visits.map((v) => {
                const t = placed.get(v.slug);
                if (!t) return null;
                const p = { x: t.px, y: t.py };
                return (
                  <g
                    key={v.slug}
                    className={`pin${active === v.slug ? " act" : ""}`}
                    tabIndex={0}
                    role="button"
                    data-track={`city: ${v.slug}`}
                    onClick={() => jump(v.slug)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), jump(v.slug))}
                  >
                    {/* Its accessible name (and desktop tooltip). A title, not aria-label, so the name and the visible "1 Barcelona" can't disagree. */}
                    <title>{`${v.number}. ${v.city}`}</title>
                    <circle className="hit" cx={p.x} cy={p.y} r={hitFor(v.slug)} />
                    <circle cx={p.x} cy={p.y} r={pinR} strokeWidth={Math.max(3, pinR / 5)} />
                    <text x={p.x} y={p.y} style={{ fontSize: numberSize }}>
                      {v.number}
                    </text>
                    <text className="lbl" x={labels.get(v.slug)?.x ?? p.x + pinR + 8} y={labels.get(v.slug)?.y ?? p.y} textAnchor={labels.get(v.slug)?.anchor ?? "start"} style={{ fontSize: labelSize }}>
                      {v.city}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="map-legend">
          <span>Pinch or use + and − to zoom. Select a pin to jump to that stop.</span>
          <span className="zoomctl">
            <button type="button" onClick={pz.zoomOut} disabled={!pz.zoomed} aria-label="Zoom out">
              −
            </button>
            <button type="button" onClick={pz.zoomIn} aria-label="Zoom in">
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setActive(null);
                pz.reset();
              }}
            >
              Reset view
            </button>
          </span>
        </div>
      </div>

      <h2 className="sr-only">Stops on this trip</h2>
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

            {v.photos.length ? (
              <Gallery photos={v.cover ? [v.cover, ...v.photos.filter((p) => p.id !== v.cover?.id)] : v.photos} label={`Photos from ${v.city}`} onOpen={(i) => lb.open(v.cover ? [v.cover, ...v.photos.filter((p) => p.id !== v.cover?.id)] : v.photos, i)} />
            ) : null}


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

            {v.moments.length ? (
              <div className="moments">
                <h4>What I did</h4>
                <ol>
                  {v.moments.map((m, mi) => (
                    <li key={`${m.title}-${mi}`}>
                      {m.when ? <span className="when">{m.when}</span> : null}
                      <b>{m.title}</b>
                      {m.note ? <p>{m.note}</p> : null}
                      {m.media.length ? (
                        <div className="mthumbs" role="group" aria-label={`${m.title}: ${m.media.length} ${m.media.length === 1 ? "photo or clip" : "photos and clips"}`}>
                          {m.media.map((x, i) => (
                            <button key={x.id} type="button" data-track={x.type === "video" ? "clip: open" : "lightbox: open"} onClick={() => lb.open(m.media, i)} aria-label={`${x.type === "video" ? "Play clip" : "Open photo"}: ${x.caption ?? m.title}`}>
                              {x.type === "photo" ? (
                                <Picture photo={{ ...x, alt: "" }} sizes="96px" />
                              ) : x.poster ? (
                                // eslint-disable-next-line @next/next/no-img-element -- poster generated by scripts/media.ts
                                <img src={x.poster} alt="" loading="lazy" width={x.w} height={x.h} />
                              ) : null}
                              {x.type === "video" ? <span aria-hidden="true">▶</span> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
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
                    <b>Didn&apos;t like</b>
                    {v.disliked}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Clips already shown under "What I did" aren't repeated here. */}
            {v.looseClips.length === 1 ? (
              <ClipPlayer clip={v.looseClips[0]} label={v.looseClips[0].caption ?? `Clip from ${v.city}`} />
            ) : v.looseClips.length > 1 ? (
              <div className="clips" role="group" aria-label={`${v.looseClips.length} clips from ${v.city}`}>
                {v.looseClips.map((clip, i) => (
                  <button key={clip.id} type="button" data-track="clip: open" onClick={() => lb.open(v.looseClips, i)} aria-label={`Play clip ${i + 1}: ${clip.caption ?? v.city}`}>
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

            {v.kind !== "match-only" ? (
              <div className="crow">
                <Score v={v} />
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
        <b>{v.notRanked ? "Not ranked" : total !== null ? `${total} / 100` : v.score.state === "incomplete" ? `Incomplete · ${v.score.rated}/10` : "Not yet rated"}</b>
        {v.notRanked ? (
          <>
            <br />
            <span className="missing">{v.notRanked}</span>
          </>
        ) : null}
        <br />
        <span className="missing">
          Would I return? {v.wouldReturn ? `${v.wouldReturn.answer[0].toUpperCase()}${v.wouldReturn.answer.slice(1)}${v.wouldReturn.why ? `: ${v.wouldReturn.why}` : ""}` : "Not answered yet"}
        </span>
      </span>
    </div>
  );
}

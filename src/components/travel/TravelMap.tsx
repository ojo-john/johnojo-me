"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MapGeometry } from "@/lib/geo";
import { spreadPins } from "@/lib/pin-spread";

/** One stop someone can jump to: a city on a particular trip. */
export interface MapStop {
  place: string;
  city: string;
  country: string;
  trip: string;
  href: string;
}

interface Picker {
  title: string;
  stops: MapStop[];
  /** Position as a percentage of the map, so it stays put when the map scales. */
  x: number;
  y: number;
}

/** Pin and label sizes in map units: the desktop look. */
const PIN_R = 7;
const HIT_R = 14;
const LABEL_SIZE = 13;
/** Below this on-screen label size (px) the map switches to its compact look: bigger pins, no labels. */
const MIN_LABEL_PX = 11;
/** Compact look, in on-screen px: a visible dot, and a hit area big enough to tap (44px across). */
const COMPACT_PIN_PX = 8;
const COMPACT_HIT_PX = 22;
const COMPACT_GAP_PX = 4;

/**
 * The Travel page's overview maps. Visited countries and city pins are clickable: one stop goes
 * straight there; several (Porto twice, or every city in Portugal) open a small picker.
 *
 * The map is drawn 900 units wide and scaled to fit, so on a phone a 7-unit pin is ~3px and 25 city
 * names can't fit legibly. There it turns compact: labels go, pins grow to a tappable size and fan out
 * of crowds (Bruges, Ghent, Brussels), and every pin opens the picker so the city is named before you leave.
 */
export function TravelMap({ regions, stops }: { regions: { region: string; map: MapGeometry }[]; stops: MapStop[] }) {
  const [picker, setPicker] = useState<Picker | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Map units per on-screen pixel; every region map shares the same width and column, so one measure fits all.
  const [unitsPerPx, setUnitsPerPx] = useState(1);
  const mapWidth = regions[0]?.map.width ?? 0;
  useEffect(() => {
    const svg = rootRef.current?.querySelector("svg");
    if (!svg) return;
    const measure = () => svg.clientWidth > 0 && setUnitsPerPx(mapWidth / svg.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [mapWidth]);
  const compact = LABEL_SIZE / unitsPerPx < MIN_LABEL_PX;
  const pinR = compact ? COMPACT_PIN_PX * unitsPerPx : PIN_R;
  const hitR = compact ? COMPACT_HIT_PX * unitsPerPx : HIT_R;

  useEffect(() => {
    if (!picker) return;
    pickerRef.current?.querySelector("a")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicker(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picker]);

  const open = (map: MapGeometry, title: string, list: MapStop[], x: number, y: number) =>
    setPicker({ title, stops: list, x: (x / map.width) * 100, y: (y / map.height) * 100 });

  return (
    <div ref={rootRef}>
      {regions.map(({ region, map }) => {
        const forPlace = (id: string) => stops.filter((s) => s.place === id);
        const forCountry = (name: string) => stops.filter((s) => s.country === name);
        const placed = compact ? spreadPins(map.points, 2 * pinR + COMPACT_GAP_PX * unitsPerPx) : map.points.map((p) => ({ ...p, px: p.x, py: p.y, moved: false }));
        return (
          <figure key={region} style={{ margin: "20px 0 0" }}>
            {regions.length > 1 ? (
              <figcaption className="kicker" style={{ color: "var(--ink-2)", marginBottom: 8 }}>
                {region}
              </figcaption>
            ) : null}
            <div className="card tmap" style={{ overflow: "hidden", position: "relative" }}>
              <svg viewBox={`0 0 ${map.width} ${map.height}`} role="group" aria-label={`${region}: visited places`} style={{ display: "block", width: "100%", height: "auto" }}>
                <path d={map.land} fill="#e4e2da" stroke="#cfccc2" />
                {map.countries.map((c) => {
                  const list = forCountry(c.name);
                  const label = `${c.name}: ${list.length === 1 ? list[0].city : `${list.length} stops`}`;
                  return list.length === 1 ? (
                    <Link key={c.name} href={list[0].href} className="tmap-country" aria-label={label} prefetch={false}>
                      <path d={c.d} />
                    </Link>
                  ) : (
                    <path
                      key={c.name}
                      d={c.d}
                      className="tmap-country"
                      role="button"
                      tabIndex={0}
                      aria-label={label}
                      onClick={(e) => {
                        const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                        open(map, c.name, list, ((e.clientX - r.left) / r.width) * map.width, ((e.clientY - r.top) / r.height) * map.height);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        const b = (e.currentTarget as SVGPathElement).getBBox();
                        open(map, c.name, list, b.x + b.width / 2, b.y + b.height / 2);
                      }}
                    />
                  );
                })}
                {/* A pin fanned out of a crowd keeps a thin line back to the city's true spot. */}
                {placed
                  .filter((p) => p.moved)
                  .map((p) => (
                    <line key={`lead-${p.id}`} x1={p.x} y1={p.y} x2={p.px} y2={p.py} stroke="var(--travel)" strokeWidth={1.5 * unitsPerPx} aria-hidden="true" />
                  ))}
                {map.points.map((p) => {
                  const list = forPlace(p.id);
                  const at = placed.find((q) => q.id === p.id) ?? { px: p.x, py: p.y };
                  const pin = (
                    <>
                      <circle cx={at.px} cy={at.py} r={hitR} fill="transparent" />
                      <circle cx={at.px} cy={at.py} r={pinR} fill="var(--travel)" stroke="var(--paper)" strokeWidth={compact ? 2 * unitsPerPx : 2} />
                      {compact ? null : (
                        <text
                          x={p.labelSide === "right" ? p.x + 11 : p.labelSide === "left" ? p.x - 11 : p.x}
                          y={p.labelSide === "below" ? p.y + 22 : p.labelSide === "above" ? p.y - 12 : p.y + 4}
                          textAnchor={p.labelSide === "right" ? "start" : p.labelSide === "left" ? "end" : "middle"}
                          fontSize={LABEL_SIZE}
                          fontWeight={700}
                          fontFamily="var(--f-ui)"
                          fill="var(--ink)"
                        >
                          {p.label}
                        </text>
                      )}
                    </>
                  );
                  const choose = () => open(map, list[0]?.city ?? p.label, list, at.px, at.py);
                  return list.length === 1 && !compact ? (
                    <Link key={p.id} href={list[0].href} className="tmap-pin" aria-label={`${list[0].city}, ${list[0].trip}`} prefetch={false}>
                      {pin}
                    </Link>
                  ) : (
                    <g
                      key={p.id}
                      className="tmap-pin"
                      role="button"
                      tabIndex={0}
                      aria-label={list.length === 1 ? `${list[0].city}, ${list[0].trip}` : `${list[0]?.city ?? p.label}: ${list.length} visits`}
                      onClick={(e) => {
                        e.stopPropagation();
                        choose();
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        choose();
                      }}
                    >
                      {pin}
                    </g>
                  );
                })}
              </svg>
              {picker && picker.stops.some((s) => map.points.some((p) => p.id === s.place)) ? (
                <div
                  ref={pickerRef}
                  className={`tmap-pick${compact ? " below" : ""}`}
                  role="dialog"
                  aria-label={`Choose a stop in ${picker.title}`}
                  // On a phone the map is too short to float the picker over it, so it sits underneath.
                  style={compact ? undefined : { left: `${Math.min(picker.x, 70)}%`, top: `${Math.min(picker.y, 70)}%` }}
                >
                  <div className="tmap-pick-hd">
                    <b>{picker.title}</b>
                    <button type="button" className="circ" onClick={() => setPicker(null)} aria-label="Close">
                      ✕
                    </button>
                  </div>
                  <ul>
                    {picker.stops.map((s) => (
                      <li key={s.href}>
                        <Link href={s.href} prefetch={false}>
                          {/* The heading already names a single city, so its one link says where it goes instead. */}
                          <span>{picker.stops.length === 1 ? "Go to this stop →" : s.city}</span>
                          <span className="mono">{s.trip}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </figure>
        );
      })}
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)" }}>{compact ? "Tap a pin to see the city, or a country to see its stops." : "Select a country or a city to jump to that stop."}</p>
    </div>
  );
}

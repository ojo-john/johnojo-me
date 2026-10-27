"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MapGeometry } from "@/lib/geo";
import { placeLabels } from "@/lib/label-place";
import { nearestGap, spreadPins } from "@/lib/pin-spread";
import { usePanZoom } from "@/lib/usePanZoom";

/** One stop someone can jump to: a city on a particular trip. */
export interface MapStop {
  place: string;
  city: string;
  country: string;
  trip: string;
  href: string;
}

interface Picker {
  region: string;
  title: string;
  stops: MapStop[];
  /** Where it was opened, in map units; placed relative to the current zoom when drawn. */
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
/** City names in the compact look, in on-screen px. Only names that fit without touching anything are shown. */
const COMPACT_LABEL_PX = 12;

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
  useEffect(() => {
    if (!picker) return;
    pickerRef.current?.querySelector("a")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicker(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picker]);

  // At full size on a phone every label would be unreadable, so only the compact look is offered there.
  const compactAtFull = LABEL_SIZE / unitsPerPx < MIN_LABEL_PX;

  return (
    <div ref={rootRef}>
      {regions.map(({ region, map }) => (
        <RegionMap key={region} region={region} map={map} caption={regions.length > 1} stops={stops} unitsPerPx={unitsPerPx} picker={picker?.region === region ? picker : null} setPicker={setPicker} pickerRef={pickerRef} />
      ))}
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)" }}>
        {compactAtFull ? "Tap a pin or a country to see its stops. Pinch or use + and − to zoom in and see more city names." : "Select a country or a city to jump to that stop. Use + and − to zoom."}
      </p>
    </div>
  );
}

/** One region's map (Europe, Americas…), with its own zoom. */
function RegionMap({
  region,
  map,
  caption,
  stops,
  unitsPerPx,
  picker,
  setPicker,
  pickerRef,
}: {
  region: string;
  map: MapGeometry;
  caption: boolean;
  stops: MapStop[];
  unitsPerPx: number;
  picker: Picker | null;
  setPicker: (p: Picker | null) => void;
  pickerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pz = usePanZoom(svgRef, map.width, map.height);
  const { view } = pz;
  // Map units per screen pixel at the current zoom: everything below is sized in these, so it stays the
  // same size on screen while the map zooms. Zoomed in far enough, the labels become readable again.
  const u = unitsPerPx * pz.scale;
  const compact = LABEL_SIZE / u < MIN_LABEL_PX;
  const k = compact ? 1 : pz.scale;
  const pinR = compact ? COMPACT_PIN_PX * u : PIN_R * k;
  const hitR = compact ? COMPACT_HIT_PX * u : HIT_R * k;
  const forPlace = (id: string) => stops.filter((s) => s.place === id);
  const forCountry = (name: string) => stops.filter((s) => s.country === name);
  const placed = compact ? spreadPins(map.points, 2 * pinR + COMPACT_GAP_PX * u) : map.points.map((p) => ({ ...p, px: p.x, py: p.y, moved: false }));
  // A pin's tap area never reaches past halfway to its nearest neighbour, so a tap lands on the pin you
  // meant. Crowded pins get a smaller area at full size; zooming in gives them room again.
  const hitFor = (id: string) => Math.min(hitR, nearestGap(placed, id) / 2);
  // On a phone, every city name that fits cleanly is shown; the rest appear as you zoom in.
  const pointLabel = new Map(map.points.map((p) => [p.id, p.label]));
  // Larger screens show every name, each on its clearest side; phones only the ones that fit cleanly.
  const labelSize = compact ? COMPACT_LABEL_PX * u : LABEL_SIZE * k;
  const labels = new Map(
    placeLabels(
      placed.map((p) => ({ id: p.id, x: p.px, y: p.py, label: pointLabel.get(p.id) ?? p.id })),
      { pinR: pinR * 1.4, fontSize: labelSize, gap: 4 * (compact ? u : k), skipCrowded: compact, bounds: { x0: view.x, y0: view.y, x1: view.x + view.w, y1: view.y + view.h } },
    ).map((l) => [l.id, l]),
  );
  const open = (title: string, list: MapStop[], x: number, y: number) => setPicker({ region, title, stops: list, x, y });
  // Where a click lands, in map units, allowing for the current zoom.
  const toMap = (e: React.MouseEvent, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * view.h };
  };
  const pickLeft = picker ? ((picker.x - view.x) / view.w) * 100 : 0;
  const pickTop = picker ? ((picker.y - view.y) / view.h) * 100 : 0;

  return (
    <figure style={{ margin: "20px 0 0" }}>
      {caption ? (
        <figcaption className="kicker" style={{ color: "var(--ink-2)", marginBottom: 8 }}>
          {region}
        </figcaption>
      ) : null}
      <div className="card tmap" style={{ overflow: "hidden", position: "relative" }}>
        <svg ref={svgRef} viewBox={pz.viewBox} role="group" aria-label={`${region}: visited places`} style={{ display: "block", width: "100%", height: "auto", touchAction: pz.touchAction }}>
          <path d={map.land} fill="#e4e2da" stroke="#cfccc2" strokeWidth={k} />
          {map.countries.map((c) => {
            const list = forCountry(c.name);
            const label = `${c.name}: ${list.length === 1 ? list[0].city : `${list.length} stops`}`;
            return list.length === 1 ? (
              <Link key={c.name} href={list[0].href} className="tmap-country" aria-label={label} prefetch={false}>
                <path d={c.d} strokeWidth={k} />
              </Link>
            ) : (
              <path
                key={c.name}
                d={c.d}
                strokeWidth={k}
                className="tmap-country"
                role="button"
                tabIndex={0}
                aria-label={label}
                onClick={(e) => {
                  const at = toMap(e, e.currentTarget.ownerSVGElement as SVGSVGElement);
                  open(c.name, list, at.x, at.y);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  const b = (e.currentTarget as SVGPathElement).getBBox();
                  open(c.name, list, b.x + b.width / 2, b.y + b.height / 2);
                }}
              />
            );
          })}
          {/* A pin fanned out of a crowd keeps a thin line back to the city's true spot. */}
          {placed
            .filter((p) => p.moved)
            .map((p) => (
              <line key={`lead-${p.id}`} x1={p.x} y1={p.y} x2={p.px} y2={p.py} stroke="var(--travel)" strokeWidth={1.5 * u} aria-hidden="true" />
            ))}
          {map.points.map((p) => {
            const list = forPlace(p.id);
            const at = placed.find((q) => q.id === p.id) ?? { px: p.x, py: p.y };
            const pin = (
              <>
                <circle cx={at.px} cy={at.py} r={hitFor(p.id)} fill="transparent" />
                <circle cx={at.px} cy={at.py} r={pinR} fill="var(--travel)" stroke="var(--paper)" strokeWidth={compact ? 2 * u : 2 * k} />
                {labels.get(p.id) && !labels.get(p.id)?.hidden ? (
                  <text className="tmap-lbl" x={labels.get(p.id)?.x} y={labels.get(p.id)?.y} textAnchor={labels.get(p.id)?.anchor} fontSize={labelSize} strokeWidth={3 * (compact ? u : k)}>
                    {p.label}
                  </text>
                ) : null}
              </>
            );
            const choose = () => open(list[0]?.city ?? p.label, list, at.px, at.py);
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
        {picker ? (
          <div
            ref={pickerRef}
            className={`tmap-pick${compact ? " below" : ""}`}
            role="dialog"
            aria-label={`Choose a stop in ${picker.title}`}
            // On a phone the map is too short to float the picker over it, so it sits underneath.
            style={compact ? undefined : { left: `${Math.min(Math.max(pickLeft, 0), 70)}%`, top: `${Math.min(Math.max(pickTop, 0), 70)}%` }}
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
                    <span>{picker.stops.length === 1 ? "Go to this stop" : s.city}</span>
                    <span className="mono">{s.trip}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
        <div className="zoomctl tmap-zoom" role="group" aria-label={`Zoom ${region}`}>
          <button type="button" onClick={pz.zoomOut} disabled={!pz.zoomed} aria-label={`Zoom out of ${region}`}>
            −
          </button>
          <button type="button" onClick={pz.zoomIn} aria-label={`Zoom in on ${region}`}>
            +
          </button>
          {pz.zoomed ? (
            <button type="button" onClick={pz.reset} aria-label={`Show all of ${region}`}>
              ⤢
            </button>
          ) : null}
        </div>
    </figure>
  );
}


"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MapGeometry } from "@/lib/geo";

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

/**
 * The Travel page's overview maps. Visited countries and city pins are clickable: one stop goes
 * straight there; several (Porto twice, or every city in Portugal) open a small picker.
 */
export function TravelMap({ regions, stops }: { regions: { region: string; map: MapGeometry }[]; stops: MapStop[] }) {
  const [picker, setPicker] = useState<Picker | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

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
    <>
      {regions.map(({ region, map }) => {
        const forPlace = (id: string) => stops.filter((s) => s.place === id);
        const forCountry = (name: string) => stops.filter((s) => s.country === name);
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
                {map.points.map((p) => {
                  const list = forPlace(p.id);
                  const pin = (
                    <>
                      <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
                      <circle cx={p.x} cy={p.y} r={7} fill="var(--travel)" stroke="var(--paper)" strokeWidth={2} />
                      <text
                        x={p.labelSide === "right" ? p.x + 11 : p.labelSide === "left" ? p.x - 11 : p.x}
                        y={p.labelSide === "below" ? p.y + 22 : p.labelSide === "above" ? p.y - 12 : p.y + 4}
                        textAnchor={p.labelSide === "right" ? "start" : p.labelSide === "left" ? "end" : "middle"}
                        fontSize={13}
                        fontWeight={700}
                        fontFamily="var(--f-ui)"
                        fill="var(--ink)"
                      >
                        {p.label}
                      </text>
                    </>
                  );
                  return list.length === 1 ? (
                    <Link key={p.id} href={list[0].href} className="tmap-pin" aria-label={`${list[0].city}, ${list[0].trip}`} prefetch={false}>
                      {pin}
                    </Link>
                  ) : (
                    <g
                      key={p.id}
                      className="tmap-pin"
                      role="button"
                      tabIndex={0}
                      aria-label={`${list[0]?.city ?? p.label}: ${list.length} visits`}
                      onClick={(e) => {
                        e.stopPropagation();
                        open(map, list[0]?.city ?? p.label, list, p.x, p.y);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        open(map, list[0]?.city ?? p.label, list, p.x, p.y);
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
                  className="tmap-pick"
                  role="dialog"
                  aria-label={`Choose a stop in ${picker.title}`}
                  style={{ left: `${Math.min(picker.x, 70)}%`, top: `${Math.min(picker.y, 70)}%` }}
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
                          <span>{s.city}</span>
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
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)" }}>Select a country or a city to jump to that stop.</p>
    </>
  );
}

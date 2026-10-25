"use client";

import Link from "next/link";
import { useState } from "react";

export interface TripSummary {
  slug: string;
  title: string;
  year: number;
  status: string;
  cities: string[];
  dates: string | null;
}

/** The year is already the row label, so "Europe 2024" reads as "Europe" inside its year. */
const shortTitle = (t: TripSummary) => t.title.replace(new RegExp(`\\s*${t.year}$`), "") || t.title;

/** "Every trip, by year": one row per year; select a trip to see its route, then open it. */
export function TripYears({ trips }: { trips: TripSummary[] }) {
  const [sel, setSel] = useState(trips[0]?.slug);
  const t = trips.find((x) => x.slug === sel);
  // Trips arrive newest first, so the years come out newest first too.
  const years = [...new Set(trips.map((x) => x.year))];
  return (
    <>
      <div className="yrows" role="group" aria-label="Trips">
        {years.map((year) => (
          <div key={year} className="yrow">
            <span className="yrow-y mono">{year}</span>
            <div className="ynodes">
              {trips
                .filter((x) => x.year === year)
                .map((x) => (
                  <button key={x.slug} className="ynode" type="button" data-track={`trip year: ${x.slug}`} aria-pressed={x.slug === sel} onClick={() => setSel(x.slug)}>
                    <b>{shortTitle(x)}</b>
                    <span>
                      {x.cities.length} {x.cities.length === 1 ? "stop" : "stops"}
                      {x.status === "draft" ? " · draft" : ""}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ydetail" aria-live="polite">
        {t ? (
          <>
            <b>{t.title}</b>
            {t.dates ? <span className="mono">{t.dates}</span> : null}
            <span>{t.cities.join(" → ")}</span>
            <Link href={`/travel/${t.slug}/`} prefetch={false}>
              Open trip →
            </Link>
          </>
        ) : null}
      </div>
    </>
  );
}

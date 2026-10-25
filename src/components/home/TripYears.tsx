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

/** "Every trip, by year": select a trip to see its route, then open it. */
export function TripYears({ trips }: { trips: TripSummary[] }) {
  const [sel, setSel] = useState(trips[0]?.slug);
  const t = trips.find((x) => x.slug === sel);
  return (
    <>
      <div className="ynodes" role="group" aria-label="Trips">
        {trips.map((x) => (
          <button key={x.slug} className="ynode" type="button" data-track={`trip year: ${x.slug}`} aria-pressed={x.slug === sel} onClick={() => setSel(x.slug)}>
            <b>{x.title}</b>
            <span>
              {x.cities.length} {x.cities.length === 1 ? "stop" : "stops"}
              {x.status === "draft" ? " · draft" : ""}
            </span>
          </button>
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

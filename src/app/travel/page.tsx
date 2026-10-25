import type { Metadata } from "next";
import Link from "next/link";
import { Picture } from "@/components/Picture";
import { RankingLab } from "@/components/travel/RankingLab";
import { slim, toView } from "@/components/travel/view";
import { getTrips } from "@/lib/content/load";
import { formatRange } from "@/lib/format";
import { mapFor, regionOf } from "@/lib/geo";

export const metadata: Metadata = {
  title: "Travel",
  description: "Every trip, city rankings, match days and photos.",
  alternates: { canonical: "/travel/" },
};

export default function TravelPage() {
  const trips = getTrips();
  const visits = trips.flatMap((t) => t.visits.map((v, i) => slim(toView(v, t, i + 1))));
  const places = Array.from(new Map(trips.flatMap((t) => t.visits).map((v) => [v.place.slug, v.place])).values());
  const countries = new Set(places.map((p) => p.country));
  // One map per region (Europe, Americas…), biggest first.
  const regions = Object.entries(Object.groupBy(places, (p) => regionOf(p.lng, p.lat)))
    .filter(([r]) => r !== "Other")
    .sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0))
    .map(([region, ps]) => ({ region, map: mapFor((ps ?? []).map((p) => ({ id: p.slug, label: p.city, lat: p.lat, lng: p.lng })), 900, (ps ?? []).length > 2 ? 640 : 420, 0.06) }));
  const stadiums = trips.flatMap((t) => t.visits.flatMap((v) => v.matches.map((m) => ({ ...m, city: v.place.city, trip: t.title, href: `/travel/${t.slug}/#${v.slug}` }))));

  return (
    <>
      <header className="band" style={{ ["--pillar" as string]: "var(--travel)" }}>
        <div className="wrap">
          <span className="kicker" style={{ opacity: 0.85 }}>
            02 · Travel
          </span>
          <h1 style={{ marginTop: 10 }}>Where I&apos;ve been</h1>
          <p className="lede">
            {trips.length} trips · {places.length} places · {countries.size} countries. Every city gets honest scores once I&apos;ve rated it, and every match gets a write-up.
          </p>
        </div>
      </header>

      <section className="wrap" aria-labelledby="trips-h">
        <h2 id="trips-h" className="sr-only">
          Trips
        </h2>
        <div className="trip-list">
          {trips.map((t) => (
            <Link key={t.slug} className="card tcard" href={`/travel/${t.slug}/`} prefetch={false}>
              <div className="ph">{t.coverPhoto ? <Picture photo={{ ...t.coverPhoto, alt: "" }} sizes="(max-width: 760px) 100vw, 33vw" /> : <span>Photos coming</span>}</div>
              <div className="bd">
                <span className="kicker" style={{ color: "var(--ink-2)" }}>
                  {formatRange(t.start, t.end) ?? t.datesNote ?? t.year}
                  {t.status === "draft" ? " · draft" : ""}
                </span>
                <h3>{t.title}</h3>
                <p>{t.visits.map((v) => v.place.city).join(" → ")}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap" aria-labelledby="map-h" style={{ paddingBottom: 64 }}>
        <h2 id="map-h" style={{ fontSize: "clamp(36px,4vw,56px)" }}>
          On the map
        </h2>
        {regions.map(({ region, map }) => (
          <figure key={region} style={{ margin: "20px 0 0" }}>
            {regions.length > 1 ? (
              <figcaption className="kicker" style={{ color: "var(--ink-2)", marginBottom: 8 }}>
                {region}
              </figcaption>
            ) : null}
            <div className="card" style={{ overflow: "hidden" }}>
          <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-labelledby={`map-alt-${region}`} style={{ display: "block", width: "100%", height: "auto" }}>
            <title id={`map-alt-${region}`}>{`Places visited: ${map.points.map((p) => p.label).join(", ")}`}</title>
            <path d={map.land} fill="#e4e2da" stroke="#cfccc2" />
            {map.points.map((p) => (
              <g key={p.id}>
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
              </g>
            ))}
          </svg>
            </div>
          </figure>
        ))}
        <ul style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", listStyle: "none", padding: 0, marginTop: 14, fontSize: 14, color: "var(--ink-2)" }} aria-label="Places visited">
          {places.map((p) => (
            <li key={p.slug}>
              {p.city}, {p.country}
            </li>
          ))}
        </ul>
      </section>

      {stadiums.length ? (
        <section className="wrap" aria-labelledby="st-h" style={{ paddingBottom: 64 }}>
          <h2 id="st-h" style={{ fontSize: "clamp(36px,4vw,56px)" }}>
            Match days
          </h2>
          <div className="trip-list">
            {stadiums.map((m) => (
              <Link key={`${m.home}-${m.away}-${m.date}`} className="card tcard" href={m.href} prefetch={false}>
                <div className="bd">
                  <span className="kicker">{[m.competition, m.stadium].filter(Boolean).join(" · ")}</span>
                  <h3>
                    {m.home} {m.score ?? "v"} {m.away}
                  </h3>
                  <p>
                    {m.city} · {m.trip}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <RankingLab visits={visits} allVisits={visits} scope="all" />
    </>
  );
}

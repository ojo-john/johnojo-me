import type { Metadata } from "next";
import { breadcrumbs, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import Link from "next/link";
import { Picture } from "@/components/Picture";
import { RankingLab } from "@/components/travel/RankingLab";
import { TravelMap, type MapStop } from "@/components/travel/TravelMap";
import { slim, toView } from "@/components/travel/view";
import { getSite, getTrips } from "@/lib/content/load";
import { travelStats } from "@/lib/content/stats";
import { formatRange } from "@/lib/format";
import { mapFor, regionOf } from "@/lib/geo";

export function generateMetadata(): Metadata {
  const s = travelStats(getTrips());
  return pageMeta({
    title: "Travel",
    description: `${s.trips} trips, ${s.places} places in ${s.countries} countries: honest city rankings out of 100, football match days and photos from every trip.`,
    path: "/travel/",
  });
}

export default function TravelPage() {
  const all = getTrips();
  const trips = all.filter((t) => t.kind === "trip");
  const visits = all.flatMap((t) => t.visits.map((v, i) => slim(toView(v, t, i + 1))));
  // Places and countries count every published stop, match days included.
  const places = Array.from(new Map(all.flatMap((t) => t.visits).map((v) => [v.place.slug, v.place])).values());
  const stats = travelStats(all);
  // "London ×3" when a place has several visits; the count is part of the label so placement leaves room for it.
  const visitCount = (slug: string) => all.reduce((n, t) => n + t.visits.filter((v) => v.place.slug === slug).length, 0);
  const pinLabel = (p: (typeof places)[number]) => (visitCount(p.slug) > 1 ? `${p.city} ×${visitCount(p.slug)}` : p.city);
  // One map per region (Europe, Americas…), biggest first.
  const regions = Object.entries(Object.groupBy(places, (p) => regionOf(p.lng, p.lat)))
    .filter(([r]) => r !== "Other")
    .sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0))
    .map(([region, ps]) => ({ region, map: mapFor((ps ?? []).map((p) => ({ id: p.slug, label: pinLabel(p), lat: p.lat, lng: p.lng, country: p.country })), 900, (ps ?? []).length > 2 ? 640 : 420, 0.06) }));
  const stops: MapStop[] = all.flatMap((t) => t.visits.map((v) => ({ place: v.place.slug, city: v.place.city, country: v.place.country, trip: t.title, href: `/travel/${t.slug}/#${v.slug}` })));
  const stadiums = all.flatMap((t) => t.visits.flatMap((v) => v.matches.map((m) => ({ ...m, city: v.place.city, trip: t.title, href: `/travel/${t.slug}/#${v.slug}` }))));

  return (
    <>
      <JsonLd data={breadcrumbs(getSite().domain, [{ name: "Travel", path: "/travel/" }])} />
      <header className="band" style={{ ["--pillar" as string]: "var(--travel)" }}>
        <div className="wrap">
          <span className="kicker" style={{ opacity: 0.85 }}>
            02 · Travel
          </span>
          <h1 style={{ marginTop: 10 }}>Where I&apos;ve been</h1>
          <p className="lede">
            {stats.trips} {stats.trips === 1 ? "trip" : "trips"} · {stats.places} places · {stats.countries} {stats.countries === 1 ? "country" : "countries"}. Every city gets honest scores once I&apos;ve rated it, and every match gets a write-up.
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
        <TravelMap regions={regions} stops={stops} />
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

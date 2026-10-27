import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MatchMedia } from "@/components/travel/MatchMedia";
import { getSite, getTrips } from "@/lib/content/load";
import { matchDays, matchStats } from "@/lib/content/match-days";
import { formatDate } from "@/lib/format";
import { breadcrumbs, pageMeta } from "@/lib/seo";

const games = () => matchDays(getTrips());

export function generateMetadata(): Metadata {
  const days = games();
  const s = matchStats(days);
  return pageMeta({
    title: "Match days",
    description: `${s.games} football matches at ${s.stadiums} stadiums in ${s.countries} countries, with the result, a write-up and photos from each game.`,
    path: "/travel/match-days/",
    image: days.flatMap((d) => d.media).find((m) => m.type === "photo") ?? null,
  });
}

/** Every football match from every trip, newest first. Each also stays on its trip's timeline. */
export default function MatchDaysPage() {
  const days = games();
  const s = matchStats(days);
  return (
    <>
      <JsonLd data={breadcrumbs(getSite().domain, [{ name: "Travel", path: "/travel/" }, { name: "Match days", path: "/travel/match-days/" }])} />
      <header className="band" style={{ ["--pillar" as string]: "var(--travel)" }}>
        <div className="wrap">
          <Link className="kicker" href="/travel/" style={{ opacity: 0.85, color: "inherit" }}>
            02 · Travel
          </Link>
          <h1 style={{ marginTop: 10 }}>Match days</h1>
          <p className="lede">
            {s.games} {s.games === 1 ? "game" : "games"} · {s.stadiums} {s.stadiums === 1 ? "stadium" : "stadiums"} · {s.countries} {s.countries === 1 ? "country" : "countries"}. Every game I&apos;ve been to on my travels.
          </p>
        </div>
      </header>

      <section className="wrap matchdays" aria-label="Matches, newest first">
        {days.map((d) => {
          const label = `${d.home} ${d.score ?? "v"} ${d.away}`;
          return (
            <article key={d.id} className="card mday" aria-labelledby={`md-${d.id}`}>
              <div className="mday-hd">
                <span className="kicker">{[d.competition, d.date ? formatDate(d.date) : null].filter(Boolean).join(" · ")}</span>
                <h2 id={`md-${d.id}`} className="fixture">
                  {label}
                </h2>
                <span className="sub">{[d.stadium, d.city, d.country].filter(Boolean).join(" · ")}</span>
              </div>
              {d.media.length ? <MatchMedia media={d.media} label={label} /> : null}
              {d.writeUp ? <p className="sum">{d.writeUp}</p> : null}
              <Link className="tap" href={d.href} prefetch={false}>
                Part of {d.tripTitle}: see the {d.city} stop
              </Link>
            </article>
          );
        })}
      </section>
    </>
  );
}

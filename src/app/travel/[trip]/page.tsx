import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Picture } from "@/components/Picture";
import { PhotoPile } from "@/components/travel/PhotoPile";
import { RankingLab } from "@/components/travel/RankingLab";
import { TripExplorer } from "@/components/travel/TripExplorer";
import { slim, toView, tripViews } from "@/components/travel/view";
import { getTrip, getTrips } from "@/lib/content/load";
import { durationDays, formatRange } from "@/lib/format";
import { mapFor } from "@/lib/geo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getTrips().map((t) => ({ trip: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/travel/[trip]">): Promise<Metadata> {
  const trip = getTrip((await params).trip);
  if (!trip) return {};
  return pageMeta({
    title: trip.title,
    description: `${trip.title}: ${trip.visits.map((v) => v.place.city).join(", ")}. City rankings, match days and photos.`,
    path: `/travel/${trip.slug}/`,
    image: trip.coverPhoto,
  });
}

const VERDICT_LABELS = {
  bestMoment: "Best moment",
  biggestSurprise: "Biggest surprise",
  wouldChange: "What I'd change",
  favouriteCity: "Favourite city",
  wouldRepeat: "Would I repeat it?",
} as const;

export default async function TripPage({ params }: PageProps<"/travel/[trip]">) {
  const trip = getTrip((await params).trip);
  if (!trip) notFound();
  const trips = getTrips();
  const visits = tripViews(trip);
  const allVisits = trips.flatMap((t) => t.visits.map((v, i) => slim(toView(v, t, i + 1))));
  const map = mapFor(trip.visits.map((v) => ({ id: v.slug, label: v.place.city, lat: v.place.lat, lng: v.place.lng })));
  const days = durationDays(trip.start, trip.end);
  const dates = formatRange(trip.start, trip.end) ?? trip.datesNote;
  const photos = trip.visits.flatMap((v) => v.photos);
  const matchCount = trip.visits.reduce((n, v) => n + v.matches.length, 0);
  const verdict = Object.entries(trip.verdict).filter(([, val]) => val) as [keyof typeof VERDICT_LABELS, string][];
  const awards = trip.awards.filter((a) => a.visit);

  return (
    <>
      <header className="band trip-band" style={{ ["--pillar" as string]: "var(--travel)" }}>
        {trip.coverPhoto ? (
          <figure className="cover">
            <Picture photo={trip.coverPhoto} sizes="(max-width: 900px) 100vw, 44vw" priority />
            {trip.coverPhoto.caption ? <figcaption>{trip.coverPhoto.caption}</figcaption> : null}
          </figure>
        ) : null}
        <div className="wrap">
          <div className="txt">
            <span className="kicker" style={{ opacity: 0.85 }}>
              02 · Travel · {trip.year}
            </span>
            <h1 style={{ marginTop: 10 }}>{trip.title}</h1>
            {trip.intro ? <p className="lede">{trip.intro}</p> : trip.theme ? <p className="lede">{trip.theme}</p> : null}
            <div className="meta">
              <span>
                {trip.visits.length} {trip.visits.length === 1 ? "stop" : "stops"}
              </span>
              {dates ? <span>{dates}</span> : null}
              {days ? <span>{days} days</span> : null}
              {trip.style ? <span>{trip.style}</span> : null}
              {matchCount ? <span>{matchCount} {matchCount === 1 ? "match" : "matches"}</span> : null}
              {trip.status === "draft" ? <span>Draft · not public</span> : null}
            </div>
          </div>
        </div>
      </header>

      <div className="wrap">
        <nav className="scrub" aria-label="Trips">
          {[...trips].sort((a, b) => a.year - b.year).map((t) => (
            <Link key={t.slug} href={`/travel/${t.slug}/`} prefetch={false} aria-current={t.slug === trip.slug ? "page" : undefined}>
              {t.title} <span>{t.visits.length}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="wrap">
        <TripExplorer visits={visits} map={map} />
      </div>

      {/* Rankings only make sense for a trip with cities; a match day has none to score. */}
      {trip.kind === "trip" && trip.visits.some((v) => v.kind === "city") ? <RankingLab visits={visits.map(slim)} allVisits={allVisits} scope="trip" /> : null}

      {awards.length || verdict.length ? (
        <section className="wrap" style={{ paddingBottom: 72 }} aria-labelledby="verdict-h">
          <h2 id="verdict-h" style={{ fontSize: 40 }}>
            Final verdict
          </h2>
          <div className="awards">
            {awards.map((a) => (
              <div key={a.award} className="card">
                <span className="kicker">{a.award}</span>
                <b>{trip.visits.find((v) => v.slug === a.visit)?.place.city}</b>
              </div>
            ))}
            {verdict.map(([k, val]) => (
              <div key={k} className="card">
                <span className="kicker">{VERDICT_LABELS[k]}</span>
                <p>{val}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <PhotoPile photos={photos} />
    </>
  );
}

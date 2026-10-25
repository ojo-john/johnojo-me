import Link from "next/link";
import { ResumeButton } from "@/components/ResumeButton";
import { Picture } from "@/components/Picture";
import { Triptych } from "@/components/home/Triptych";
import { TripYears } from "@/components/home/TripYears";
import { getExperience, getPosts, getSite, getTrips } from "@/lib/content/load";
import { formatRange } from "@/lib/format";
import { mapFor, regionOf } from "@/lib/geo";

export default function Home() {
  const site = getSite();
  const exp = getExperience();
  const trips = getTrips();
  const posts = getPosts();
  const latestMilestone = exp.milestones[exp.milestones.length - 1];
  const latestTrip = trips.find((t) => t.status === "published") ?? trips[0];
  const travelCover = trips.find((t) => t.coverPhoto)?.coverPhoto ?? null;
  const featured = posts[0];
  const places = Array.from(new Map(trips.flatMap((t) => t.visits).map((v) => [v.place.slug, v.place])).values());
  // The home teaser map shows the region with the most places (Europe today).
  const byRegion = Object.groupBy(places, (p) => regionOf(p.lng, p.lat));
  const mainRegion = Object.entries(byRegion).sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0))[0]?.[1] ?? [];
  const map = mapFor(mainRegion.map((p) => ({ id: p.slug, label: p.city, lat: p.lat, lng: p.lng })), 600, 420, 0.08);
  const [first, ...rest] = site.name.split(" ");
  const topSkills = Object.values(exp.skills).flat().slice(0, 8);

  return (
    <>
      <section className="wrap intro" aria-labelledby="hn">
        <div>
          <h1 id="hn">
            <span className="w">{first}</span> <span className="w">{rest.join(" ")}</span>
          </h1>
          <div className="role">
            <span>
              {site.role.replace("Software Development Engineer", "SDE")} @ {site.company}
            </span>
            <span>since {exp.milestones[0].label}</span>
            <span>Java · TypeScript · AWS</span>
          </div>
          <p className="lede">{site.intro}</p>
          <div className="ctas">
            <ResumeButton className="btn fill">View résumé</ResumeButton>
            <a className="btn" href={site.github} target="_blank" rel="noopener noreferrer">
              GitHub ↗
            </a>
            <Link className="btn" href="/work/">
              Experience →
            </Link>
          </div>
        </div>
        <aside className="card now" aria-labelledby="now-h">
          <h2 id="now-h">
            <i aria-hidden="true" />
            Latest
          </h2>
          <Link href="/work/">
            <span className="mono">Work</span>
            <b>{latestMilestone.title} · {latestMilestone.label}</b>
            <span aria-hidden="true">→</span>
          </Link>
          {latestTrip ? (
            <Link href={`/travel/${latestTrip.slug}/`}>
              <span className="mono">Travel</span>
              <b>
                {latestTrip.title} · {latestTrip.visits.length} stops
              </b>
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
          <Link href={featured ? `/journal/${featured.slug}/` : "/journal/"}>
            <span className="mono">Journal</span>
            <b>
              {featured ? featured.title : "First posts coming soon"} {featured?.sample ? <span className="flag">Sample</span> : null}
            </b>
            <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </section>

      <section className="wrap" aria-label="Work, Travel and Journal">
        <Triptych>
          <Link className="panel w" href="/work/" data-i="0">
            <span className="kicker">01 · Work</span>
            <h2>What I build</h2>
            <span className="go" aria-hidden="true">→</span>
            <div className="more">
              <p>Distributed systems, event-driven architecture and infrastructure as code. Career timeline, projects and résumé.</p>
              <div className="tags">
                {topSkills.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            </div>
          </Link>
          <Link className="panel t" href="/travel/" data-i="1">
            {travelCover ? (
              <div className="bg" aria-hidden="true">
                <Picture photo={{ ...travelCover, alt: "" }} sizes="(max-width: 900px) 100vw, 40vw" />
              </div>
            ) : null}
            <span className="shade" aria-hidden="true" />
            <span className="kicker">02 · Travel</span>
            <h2>Where I&apos;ve been</h2>
            <span className="go" aria-hidden="true">→</span>
            <div className="more">
              <svg viewBox={`0 0 ${map.width} ${map.height}`} aria-hidden="true" style={{ width: "100%", maxWidth: 340 }}>
                <path d={map.land} fill="rgba(251,250,247,.18)" />
                {map.points.map((p) => (
                  <circle key={p.id} cx={p.x} cy={p.y} r={6} fill="var(--sun)" />
                ))}
              </svg>
              <p>
                {trips.length} trips, {places.length} places, with city rankings, match days and photos.
              </p>
            </div>
          </Link>
          <Link className="panel j" href="/journal/" data-i="2">
            <span className="kicker">03 · Journal</span>
            <h2>What I&apos;m learning</h2>
            <span className="go" aria-hidden="true">→</span>
            <div className="more">
              <p style={{ fontFamily: "var(--f-read)", fontSize: 22, lineHeight: 1.3 }}>Bible studies, faith, life lessons, essays and engineering notes.</p>
              <div className="tags">
                {["Bible Study", "Faith", "Life Lessons", "Essays"].map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          </Link>
        </Triptych>
      </section>

      <section className="wrap years" aria-labelledby="yh">
        <span className="kicker" style={{ color: "var(--ink-2)" }}>
          Travel timeline
        </span>
        <h2 id="yh" style={{ marginTop: 8 }}>
          Every trip, by year
        </h2>
        <TripYears
          trips={trips.map((t) => ({
            slug: t.slug,
            title: t.title,
            year: t.year,
            status: t.status,
            cities: t.visits.map((v) => v.place.city),
            dates: formatRange(t.start, t.end) ?? t.datesNote ?? null,
          }))}
        />
      </section>
    </>
  );
}

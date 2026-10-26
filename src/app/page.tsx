import Link from "next/link";
import { ResumeButton } from "@/components/ResumeButton";
import { Picture } from "@/components/Picture";
import { FlowPattern } from "@/components/home/FlowPattern";
import { Triptych } from "@/components/home/Triptych";
import { TripYears } from "@/components/home/TripYears";
import { getExperience, getPosts, getProjects, getSite, getTrips, journalIsOpen } from "@/lib/content/load";
import { travelStats } from "@/lib/content/stats";
import { formatRange } from "@/lib/format";
import { mapFor, regionOf } from "@/lib/geo";

/** The project whose system diagram is drawn behind the home Work panel. */
const FLOW_PROJECT = "codequest";
/** How many skills to show on the Work panel if no home page tags are chosen. */
const HOME_TAG_FALLBACK = 6;

export default function Home() {
  const site = getSite();
  const exp = getExperience();
  // Match days (one-off games) aren't trips; they live under Travel → Match days.
  const allTrips = getTrips();
  const trips = allTrips.filter((t) => t.kind === "trip");
  const stats = travelStats(allTrips);
  const posts = getPosts();
  const latestMilestone = exp.milestones[exp.milestones.length - 1];
  const latestTrip = trips.find((t) => t.status === "published") ?? trips[0];
  const travelCover = trips.find((t) => t.coverPhoto)?.coverPhoto ?? null;
  const featured = posts[0];
  const journal = journalIsOpen();
  const places = Array.from(new Map(trips.flatMap((t) => t.visits).map((v) => [v.place.slug, v.place])).values());
  // The home teaser map shows the region with the most places (Europe today).
  const byRegion = Object.groupBy(places, (p) => regionOf(p.lng, p.lat));
  const mainRegion = Object.entries(byRegion).sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0))[0]?.[1] ?? [];
  const map = mapFor(mainRegion.map((p) => ({ id: p.slug, label: p.city, lat: p.lat, lng: p.lng })), 600, 420, 0.08);
  const [first, ...rest] = site.name.split(" ");
  const topSkills = exp.featuredSkills.length > 0 ? exp.featuredSkills : Object.values(exp.skills).flat().slice(0, HOME_TAG_FALLBACK);
  // The Work panel's background: CodeQuest's data flow, or any project with a diagram if it's gone.
  const withDiagram = getProjects().filter((p) => p.diagram.length > 0);
  const flowProject = withDiagram.find((p) => p.slug === FLOW_PROJECT) ?? withDiagram[0];

  // Tells search engines who this site is about (name searches, knowledge panel).
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: site.name,
    url: `https://${site.domain}/`,
    jobTitle: site.role,
    worksFor: { "@type": "Organization", name: site.company },
    alumniOf: exp.education.map((e) => ({ "@type": "CollegeOrUniversity", name: e.school })),
    ...(site.location ? { address: { "@type": "PostalAddress", addressLocality: site.location } } : {}),
    sameAs: [site.github, site.linkedin].filter(Boolean),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, "\\u003c") }} />
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
        <section className="card now" aria-labelledby="now-h">
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
          {journal ? (
          <Link href={featured ? `/journal/${featured.slug}/` : "/journal/"}>
            <span className="mono">Journal</span>
            <b>
              {featured ? featured.title : "First posts coming soon"} {featured?.sample ? <span className="flag">Sample</span> : null}
            </b>
            <span aria-hidden="true">→</span>
          </Link>
          ) : null}
        </section>
      </section>

      <section className="wrap" aria-label={journal ? "Work, Travel and Journal" : "Work and Travel"}>
        <Triptych panels={journal ? 3 : 2}>
          <Link className="panel w" href="/work/" data-i="0">
            {flowProject ? (
              <div className="bg" aria-hidden="true">
                <FlowPattern title={flowProject.name} steps={flowProject.diagram.map((d) => d.label)} />
              </div>
            ) : null}
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
                {stats.trips} trips, {stats.places} places, with city rankings, match days and photos.
              </p>
            </div>
          </Link>
          {journal ? (
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
          ) : null}
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

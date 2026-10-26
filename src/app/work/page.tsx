import type { Metadata } from "next";
import { breadcrumbs, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { ResumeButton } from "@/components/ResumeButton";
import { CareerTimeline } from "@/components/work/CareerTimeline";
import { experienceByYear } from "@/lib/content/experience-years";
import { SkillsProjects } from "@/components/work/SkillsProjects";
import { getExperience, getProjects, getSite } from "@/lib/content/load";

export function generateMetadata(): Metadata {
  const site = getSite();
  const projects = getProjects().map((p) => p.name);
  const skills = getExperience().featuredSkills.slice(0, 3).join(", ");
  return pageMeta({
    title: "Work",
    description: `${site.name}, ${site.role.replace("Software Development Engineer", "SDE")} at ${site.company}: career timeline, ${skills} skills, and projects${projects.length ? ` like ${projects.join(" and ")}` : ""}.`,
    path: "/work/",
  });
}

export default function WorkPage() {
  const site = getSite();
  const exp = getExperience();
  const projects = getProjects();
  // Build date stands in for "today": the site is static and rebuilt whenever content changes.
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <JsonLd data={breadcrumbs(site.domain, [{ name: "Work", path: "/work/" }])} />
      <header className="band" style={{ ["--pillar" as string]: "var(--work)" }}>
        <div className="wrap">
          <span className="kicker" style={{ opacity: 0.85 }}>
            01 · Work
          </span>
          <h1 style={{ marginTop: 10 }}>What I build</h1>
          <p className="lede">
            {site.role} at {site.company}. Distributed systems, event-driven architecture, testing, observability and CI/CD.
          </p>
          <div className="ctas">
            <ResumeButton className="btn fill">View résumé</ResumeButton>
            <a className="btn" href={site.github} target="_blank" rel="noopener noreferrer">
              GitHub ↗
            </a>
            {site.linkedin ? (
              <a className="btn" href={site.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn ↗
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <section className="wrap" id="career" aria-labelledby="car">
        <h2 id="car" className="sr-only">
          Career timeline
        </h2>
        <CareerTimeline milestones={exp.milestones} years={experienceByYear(exp, new Date(today).getFullYear())} today={today} />
      </section>

      <section className="wrap" id="experience" aria-labelledby="exp-h" style={{ paddingTop: 48 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
          <h2 id="exp-h" style={{ fontSize: 40 }}>
            Experience
          </h2>
          <a className="btn" href="/resume/">
            Full résumé →
          </a>
        </div>
        <p className="missing" style={{ marginTop: 8, fontSize: 14 }}>
          {exp.achievementsNote}
        </p>
        {/* Every role starts closed: the timeline's year card above already shows the current one. */}
        <div className="roles">
          {exp.roles.flatMap((r) =>
            r.sections.map((sec) => (
              <details key={r.title + sec.title} className="card">
                <summary>
                  <h3>{sec.title}</h3>
                  <span className="mono">
                    {r.org} · {r.title} · {sec.dates ?? r.dates}
                  </span>
                </summary>
                <ul>
                  {sec.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </details>
            )),
          )}
        </div>
        {exp.education.map((e) => (
          <p key={e.school} className="mono" style={{ marginTop: 16, color: "var(--ink-2)" }}>
            Education · {e.degree}, {e.school} · {e.years}
          </p>
        ))}
      </section>

      <SkillsProjects
        skills={exp.skills}
        projects={projects.map((p) => ({
          slug: p.slug,
          name: p.name,
          kind: p.kind,
          stage: p.stage,
          status: p.status,
          summary: p.summary,
          problem: p.problem,
          approach: p.approach,
          stack: p.stack,
          repo: p.repo,
          repoNote: p.repoNote,
          demo: p.demo,
          demoNote: p.demoNote,
          diagram: p.diagram,
        }))}
      />
    </>
  );
}

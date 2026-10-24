import type { Metadata } from "next";
import { ResumeButton } from "@/components/ResumeButton";
import { CareerTimeline } from "@/components/work/CareerTimeline";
import { SkillsProjects } from "@/components/work/SkillsProjects";
import { getExperience, getProjects, getSite } from "@/lib/content/load";

export const metadata: Metadata = {
  title: "Work",
  description: "Career timeline, skills and engineering projects.",
  alternates: { canonical: "/work/" },
};

export default function WorkPage() {
  const site = getSite();
  const exp = getExperience();
  const projects = getProjects();
  // Build date stands in for "today": the site is static and rebuilt whenever content changes.
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
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
        <CareerTimeline milestones={exp.milestones} today={today} currentTitle={`${site.role} at ${site.company}`} />
        <p className="missing" style={{ marginTop: 12, fontSize: 14 }}>
          {exp.achievementsNote}
        </p>
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
          diagram: p.diagram,
        }))}
      />
    </>
  );
}

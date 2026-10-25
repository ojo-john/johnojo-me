"use client";

import { useState } from "react";
import { ArchDiagram } from "./ArchDiagram";

export interface ProjectView {
  slug: string;
  name: string;
  kind: "case-study" | "project";
  stage: string;
  status: string;
  summary: string;
  problem: string;
  approach: string;
  stack: string[];
  repo: string | null;
  repoNote?: string;
  demo: string | null;
  demoNote?: string;
  diagram: { label: string; note: string }[];
}

/** Loose match so "PostgreSQL" lights up "Supabase / PostgreSQL" and "Next.js" matches "Next.js 16". */
const uses = (tech: string, skill: string) => {
  const a = tech.toLowerCase(), b = skill.toLowerCase();
  return a.includes(b) || b.includes(a.split(/[ /]/)[0]);
};

/** Skill chips that highlight the personal projects using each skill. */
export function SkillsProjects({ skills, projects }: { skills: Record<string, string[]>; projects: ProjectView[] }) {
  const [skill, setSkill] = useState<string | null>(null);
  const total = new Set(Object.values(skills).flat()).size;
  const hitCount = skill ? projects.filter((p) => p.stack.some((t) => uses(t, skill))).length : 0;
  return (
    <>
      <section className="wrap skills-filter" id="skills" aria-labelledby="sk">
        <h2 id="sk" style={{ fontSize: 40 }}>
          Skills{" "}
          <span style={{ fontSize: 15, fontFamily: "var(--f-ui)", fontWeight: 600, color: "var(--ink-2)", letterSpacing: 0 }}>
            Select one to see where it&apos;s used
          </span>
        </h2>
        {Object.entries(skills).map(([group, items]) => (
          <div className="row" role="group" aria-label={group} key={group}>
            <span className="kicker">{group}</span>
            {items.map((s) => (
              <button key={s} className="chip" type="button" data-track={`skill: ${s}`} style={{ ["--pill" as string]: "var(--work)" }} aria-pressed={skill === s} onClick={() => setSkill(skill === s ? null : s)}>
                {s}
              </button>
            ))}
          </div>
        ))}
        <p className="fstat" aria-live="polite">
          {skill
            ? projects.length
              ? `${skill}: used in ${hitCount} of ${projects.length} personal project${projects.length === 1 ? "" : "s"}. Work at Amazon isn't listed because it's confidential.`
              : `${skill}: personal projects will appear here once they're published.`
            : `${total} skills · nothing selected`}
        </p>
      </section>

      <section className="wrap" aria-label="Projects" style={{ paddingBottom: 96 }}>
        {projects.length ? (
          <div className="projgrid">
            {projects.map((p) => {
              const hit = !!skill && p.stack.some((t) => uses(t, skill));
              return (
                <article key={p.slug} className={`card pcard${hit ? " hit" : ""}${skill && !hit ? " dim" : ""}`} aria-labelledby={`p-${p.slug}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <span className="kicker" style={{ color: "var(--work)" }}>
                      {p.kind === "case-study" ? "Case study" : "Project"} · {p.stage}
                    </span>
                    {p.status === "draft" ? <span className="flag">Draft · not public</span> : null}
                  </div>
                  <h3 id={`p-${p.slug}`}>{p.name}</h3>
                  <p>{p.summary}</p>
                  {p.diagram.length ? <ArchDiagram name={p.name} steps={p.diagram} /> : null}
                  <dl>
                    <dt>Problem</dt>
                    <dd>{p.problem}</dd>
                    <dt>Approach</dt>
                    <dd>{p.approach}</dd>
                    <dt>Code</dt>
                    <dd>
                      {p.repo ? (
                        <a href={p.repo} target="_blank" rel="noopener noreferrer">
                          View on GitHub ↗
                        </a>
                      ) : (
                        p.repoNote ?? "Not public"
                      )}
                      {p.demo ? (
                        <>
                          {" · "}
                          <a href={p.demo} target="_blank" rel="noopener noreferrer">
                            Live app ↗
                          </a>
                          {p.demoNote ? <span style={{ color: "var(--ink-2)" }}> ({p.demoNote.toLowerCase()})</span> : null}
                        </>
                      ) : null}
                    </dd>
                  </dl>
                  <div className="tags">
                    {p.stack.map((t) => (
                      <span key={t} className={skill && uses(t, skill) ? "hit" : undefined}>
                        {t}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-card" style={{ marginTop: 32 }}>
            <h3>Case studies coming soon</h3>
            <p style={{ marginTop: 8, color: "var(--ink-2)" }}>Write-ups of personal projects will appear here once they&apos;re approved.</p>
          </div>
        )}
      </section>
    </>
  );
}

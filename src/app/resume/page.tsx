import type { Metadata } from "next";
import { breadcrumbs, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { getExperience, getSite } from "@/lib/content/load";

export function generateMetadata(): Metadata {
  const site = getSite();
  const skills = getExperience().featuredSkills.slice(0, 3).join(", ");
  return pageMeta({ title: "Résumé", description: `${site.name}'s résumé: ${site.role} at ${site.company}. Experience, education and technical skills including ${skills}.`, path: "/resume/" });
}

/** Résumé built from content/experience.yaml. The same page is printed to /resume.pdf (npm run resume:pdf). */
export default function ResumePage() {
  const site = getSite();
  const exp = getExperience();
  // Shown without "https://", but each one is a real link, on the page and in the printed PDF.
  const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const contact: { text: string; href?: string }[] = [
    ...(site.location ? [{ text: site.location }] : []),
    ...(site.email ? [{ text: site.email, href: `mailto:${site.email}` }] : []),
    ...(site.linkedin ? [{ text: bare(site.linkedin), href: site.linkedin }] : []),
    { text: bare(site.github), href: site.github },
    { text: site.domain, href: `https://${site.domain}/` },
  ];
  return (
    <article className="wrap resume">
      <JsonLd data={breadcrumbs(site.domain, [{ name: "Résumé", path: "/resume/" }])} />
      <header className="resume-head">
        <div>
          <h1>{site.name}</h1>
          <p className="resume-role">
            {site.role} · {site.company}
          </p>
        </div>
        <ul className="resume-contact">
          {contact.map((c) => (
            <li key={c.text}>{c.href ? <a href={c.href}>{c.text}</a> : c.text}</li>
          ))}
        </ul>
        {site.resume ? (
          <a className="btn fill no-print" href={site.resume} download>
            Download PDF
          </a>
        ) : null}
      </header>

      <section aria-labelledby="r-exp">
        <h2 id="r-exp">Experience</h2>
        {exp.roles.map((r) => (
          <div key={r.title + r.dates} className="resume-role-block">
            <div className="resume-line">
              <h3>
                {r.org} · {r.title}
                {r.note ? <span className="resume-note"> ({r.note})</span> : null}
              </h3>
              <span className="mono">
                {r.dates}
                {r.location ? ` · ${r.location}` : ""}
              </span>
            </div>
            {r.sections.map((s) => (
              <div key={s.title} className="resume-section">
                <p className="resume-section-title">
                  <b>{s.title}</b>
                  {s.dates ? <span className="mono"> · {s.dates}</span> : null}
                </p>
                <ul>
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section aria-labelledby="r-skills">
        <h2 id="r-skills">Technical skills</h2>
        <dl className="resume-skills">
          {Object.entries(exp.skills).map(([g, items]) => (
            <div key={g}>
              <dt>{g}</dt>
              <dd>{items.join(", ")}</dd>
            </div>
          ))}
        </dl>
      </section>

      {exp.education.length ? (
        <section aria-labelledby="r-edu">
          <h2 id="r-edu">Education</h2>
          {exp.education.map((e) => (
            <div key={e.school} className="resume-line">
              <h3>{e.school}</h3>
              <span className="mono">
                {e.degree} · {e.years}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </article>
  );
}

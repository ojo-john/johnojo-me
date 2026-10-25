import type { Experience } from "./schema";

/** One year of the career, as shown when a year is picked on the Work page. */
export interface ExperienceYear {
  year: number;
  milestones: { label: string; title: string; detail: string; body?: string }[];
  work: { org: string; role: string; title: string; dates: string; bullets: string[] }[];
}

const yearOf = (yyyyMm: string) => Number(yyyyMm.slice(0, 4));

/**
 * Group milestones and role sections by calendar year, from the first milestone to `currentYear`.
 * A section counts for every year it overlaps; one with no end is ongoing. Sections without a start
 * date can't be placed, so they only appear in the full Experience list. Newest work comes first.
 */
export function experienceByYear(exp: Pick<Experience, "milestones" | "roles">, currentYear: number): ExperienceYear[] {
  if (exp.milestones.length === 0) return [];
  const first = Math.min(...exp.milestones.map((m) => yearOf(m.date)));
  const years: ExperienceYear[] = [];
  for (let year = first; year <= currentYear; year++) {
    years.push({
      year,
      milestones: exp.milestones
        .filter((m) => yearOf(m.date) === year)
        .map(({ label, title, detail, body }) => ({ label, title, detail, ...(body ? { body } : {}) })),
      work: exp.roles.flatMap((r) =>
        r.sections
          .filter((s) => s.start && yearOf(s.start) <= year && (s.end ? yearOf(s.end) : currentYear) >= year)
          .map((s) => ({ org: r.org, role: r.title, title: s.title, dates: s.dates ?? r.dates, bullets: s.bullets })),
      ),
    });
  }
  return years;
}

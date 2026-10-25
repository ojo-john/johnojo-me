import { describe, expect, it } from "vitest";
import { experienceByYear } from "./experience-years";

type Exp = Parameters<typeof experienceByYear>[0];
const milestone = (date: string, title = `m ${date}`) => ({ date, label: date, title, detail: "d" });
const section = (title: string, start?: string, end?: string) => ({ title, start, end, bullets: [`${title} bullet`] });
const exp = (milestones: Exp["milestones"], sections: ReturnType<typeof section>[]): Exp => ({
  milestones,
  roles: [{ title: "SDE", org: "Amazon", dates: "2021 – Present", location: null, note: undefined, sections }] as unknown as Exp["roles"],
});

describe("experienceByYear", () => {
  it("experienceByYear_noMilestones_returnsEmpty", () => {
    expect(experienceByYear(exp([], [section("a", "2021-01")]), 2026)).toEqual([]);
  });

  it("experienceByYear_yearWithoutMilestone_stillListedWithOngoingWork", () => {
    const years = experienceByYear(exp([milestone("2023-07")], [section("modernise", "2023-07", "2025-10")]), 2025);
    expect(years.find((y) => y.year === 2024)).toMatchObject({ milestones: [], work: [{ title: "modernise" }] });
  });

  it("experienceByYear_sectionEndsMidYear_countedInEndYearNotAfter", () => {
    const years = experienceByYear(exp([milestone("2023-07")], [section("modernise", "2023-07", "2025-10")]), 2026);
    expect(years.map((y) => [y.year, y.work.length])).toEqual([[2023, 1], [2024, 1], [2025, 1], [2026, 0]]);
  });

  it("experienceByYear_noEndDate_treatedAsOngoingToCurrentYear", () => {
    const years = experienceByYear(exp([milestone("2025-10")], [section("lead", "2025-10")]), 2026);
    expect(years.at(-1)).toMatchObject({ year: 2026, work: [{ title: "lead" }] });
  });

  it("experienceByYear_sectionWithoutStart_leftOut", () => {
    const years = experienceByYear(exp([milestone("2021-06")], [section("undated")]), 2021);
    expect(years[0].work).toEqual([]);
  });

  it("experienceByYear_milestones_groupedIntoTheirYear", () => {
    const years = experienceByYear(exp([milestone("2021-06", "intern"), milestone("2022-05", "intern again")], []), 2022);
    expect(years.map((y) => y.milestones.map((m) => m.title))).toEqual([["intern"], ["intern again"]]);
  });
});

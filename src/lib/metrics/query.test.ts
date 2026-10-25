import { describe, expect, it } from "vitest";
import { AnalyticsUnavailable, buildQueries, parseRange, runQueries, shapeMetrics, type QueryName, type Rows } from "./query";

const NOW = new Date("2026-10-25T12:00:00Z");
const empty: Record<QueryName, Rows> = { viewsByDay: [], clicks: [], links: [], referrers: [] };

describe("parseRange", () => {
  it("parseRange_missing_defaultsTo30", () => {
    expect(parseRange(null)).toBe(30);
  });

  it("parseRange_unsupportedValue_returnsNull", () => {
    expect(parseRange("365")).toBeNull();
  });

  it("parseRange_injectionAttempt_returnsNull", () => {
    expect(parseRange("7' DAY; DROP")).toBeNull();
  });

  it("parseRange_seven_isAccepted", () => {
    expect(parseRange("7")).toBe(7);
  });
});

describe("buildQueries", () => {
  it("buildQueries_unsafeDatasetName_throws", () => {
    expect(() => buildQueries("metrics; DROP TABLE x", 7)).toThrow();
  });

  it("buildQueries_range_appearsInEveryQuery", () => {
    expect(Object.values(buildQueries("johnojo_metrics", 7)).every((q) => q.includes("INTERVAL '7' DAY") && q.includes("FROM johnojo_metrics"))).toBe(true);
  });
});

describe("shapeMetrics", () => {
  it("shapeMetrics_noRows_givesZeroFilledDaysAndEmptyTables", () => {
    const m = shapeMetrics(empty, 7, NOW);
    expect([m.daily.length, m.daily.every((d) => d.views === 0), m.daily[6].day, m.totals, m.pages, m.clicks]).toEqual([7, true, "2026-10-25", { views: 0, clicks: 0 }, [], []]);
  });

  it("shapeMetrics_viewsAcrossPagesAndDays_sumsPerDayAndPerPage", () => {
    const m = shapeMetrics(
      {
        ...empty,
        viewsByDay: [
          { day: "2026-10-24 00:00:00", path: "/", n: "3" },
          { day: "2026-10-24 00:00:00", path: "/work/", n: "2" },
          { day: "2026-10-25 00:00:00", path: "/work/", n: 4 },
        ],
      },
      7,
      NOW,
    );
    expect([m.totals.views, m.daily.slice(-2), m.pages]).toEqual([
      9,
      [
        { day: "2026-10-24", views: 5 },
        { day: "2026-10-25", views: 4 },
      ],
      [
        { path: "/work/", views: 6 },
        { path: "/", views: 3 },
      ],
    ]);
  });

  it("shapeMetrics_garbageRows_areIgnoredOrCountedAsZero", () => {
    const m = shapeMetrics({ ...empty, clicks: [{ label: "", n: 5 }, { label: "year: 2024", n: "NaN" }, { label: 3, n: 1 }] }, 7, NOW);
    expect(m.clicks).toEqual([{ label: "year: 2024", count: 0 }]);
  });

  it("shapeMetrics_clicks_totalMatchesTable", () => {
    const m = shapeMetrics({ ...empty, clicks: [{ label: "résumé: open", n: "7" }, { label: "year: 2024", n: "2" }] }, 30, NOW);
    expect(m.totals.clicks).toBe(9);
  });
});

describe("runQueries", () => {
  const queries = buildQueries("johnojo_metrics", 7);

  it("runQueries_networkError_throwsAnalyticsUnavailable", async () => {
    const f = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    await expect(runQueries(queries, "acct", "token", f)).rejects.toBeInstanceOf(AnalyticsUnavailable);
  });

  it("runQueries_httpError_throwsAnalyticsUnavailable", async () => {
    const f = (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch;
    await expect(runQueries(queries, "acct", "token", f)).rejects.toThrow(/HTTP 403/);
  });

  it("runQueries_nonJsonBody_throwsAnalyticsUnavailable", async () => {
    const f = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    await expect(runQueries(queries, "acct", "token", f)).rejects.toThrow(/not JSON/);
  });

  it("runQueries_success_returnsRowsPerQuery", async () => {
    const f = (async (_u: string, init: RequestInit) => Response.json({ data: String(init.body).includes("blob4") ? [{ target: "github.com", n: "1" }] : [] })) as unknown as typeof fetch;
    expect((await runQueries(queries, "acct", "token", f)).links).toEqual([{ target: "github.com", n: "1" }]);
  });
});

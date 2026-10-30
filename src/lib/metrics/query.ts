/**
 * Reading the numbers back: the SQL sent to the Workers Analytics Engine SQL API and the shaping of its
 * rows into the JSON the admin metrics page draws. Counts use SUM(_sample_interval) because Analytics
 * Engine may sample at high volume; each stored row then stands for several events.
 * https://developers.cloudflare.com/analytics/analytics-engine/sql-api/
 */

import { ENTRY } from "./events";

/** How visits with no referrer and no source tag are listed. */
export const DIRECT_LABEL = "Direct, bookmark or app";

export const RANGES = [7, 30] as const;
export type Range = (typeof RANGES)[number];

/** ?days=7 or ?days=30; missing means 30. Anything else is rejected rather than guessed. */
export function parseRange(param: string | null): Range | null {
  if (param === null || param === "") return 30;
  const n = Number(param);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : null;
}

/** Dataset names go into SQL, so only plain identifiers are allowed. */
export const isSafeDataset = (name: string | undefined): name is string => !!name && /^[a-z][a-z0-9_]{0,62}$/.test(name);

const TOP = 50;

export function buildQueries(dataset: string, days: Range) {
  if (!isSafeDataset(dataset)) throw new Error("unsafe dataset name");
  const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;
  return {
    viewsByDay: `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS path, SUM(_sample_interval) AS n FROM ${dataset} WHERE blob1 = 'page_view' AND ${since} GROUP BY day, path ORDER BY day ASC LIMIT 10000 FORMAT JSON`,
    clicks: `SELECT blob3 AS label, SUM(_sample_interval) AS n FROM ${dataset} WHERE blob1 = 'click' AND ${since} GROUP BY label ORDER BY n DESC LIMIT ${TOP} FORMAT JSON`,
    links: `SELECT blob4 AS target, SUM(_sample_interval) AS n FROM ${dataset} WHERE blob1 = 'click' AND blob4 != '' AND ${since} GROUP BY target ORDER BY n DESC LIMIT ${TOP} FORMAT JSON`,
    // Visits (first page views) by source; "" means direct, a bookmark, or an app that hides where it came from.
    referrers: `SELECT blob3 AS host, SUM(_sample_interval) AS n FROM ${dataset} WHERE blob1 = 'page_view' AND blob5 = '${ENTRY}' AND ${since} GROUP BY host ORDER BY n DESC LIMIT ${TOP} FORMAT JSON`,
  };
}
export type QueryName = keyof ReturnType<typeof buildQueries>;
export type Rows = Record<string, unknown>[];

export interface Metrics {
  days: Range;
  generatedAt: string;
  /** visits: first page views, so one person reading three pages counts once. */
  totals: { views: number; clicks: number; visits: number };
  /** Views per day for the whole site, every day in the range (0 when there were none). */
  daily: { day: string; views: number }[];
  /** Views per page per day, as stored. */
  pagesByDay: { day: string; path: string; views: number }[];
  /** Pages by total views in the range. */
  pages: { path: string; views: number }[];
  clicks: { label: string; count: number }[];
  links: { target: string; count: number }[];
  referrers: { host: string; count: number }[];
}

/** Analytics Engine returns 64-bit counts as strings in JSON; anything unreadable counts as 0. */
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const dayOf = (v: unknown) => str(v).slice(0, 10);

export function shapeMetrics(rows: Record<QueryName, Rows>, days: Range, now: Date): Metrics {
  const pagesByDay = rows.viewsByDay.map((r) => ({ day: dayOf(r.day), path: str(r.path), views: num(r.n) })).filter((r) => r.day && r.path);

  const perDay = new Map<string, number>();
  const perPage = new Map<string, number>();
  for (const r of pagesByDay) {
    perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.views);
    perPage.set(r.path, (perPage.get(r.path) ?? 0) + r.views);
  }
  // A continuous run of days, oldest first, so a quiet day shows as a gap rather than disappearing.
  const daily: Metrics["daily"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ day, views: perDay.get(day) ?? 0 });
  }
  const referrers = rows.referrers.map((r) => ({ host: typeof r.host === "string" ? r.host || DIRECT_LABEL : "", count: num(r.n) })).filter((r) => r.host && r.count);
  const clicks = rows.clicks.map((r) => ({ label: str(r.label), count: num(r.n) })).filter((r) => r.label);
  return {
    days,
    generatedAt: now.toISOString(),
    totals: { views: pagesByDay.reduce((a, r) => a + r.views, 0), clicks: clicks.reduce((a, r) => a + r.count, 0), visits: referrers.reduce((a, r) => a + r.count, 0) },
    daily,
    pagesByDay,
    pages: [...perPage].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views || a.path.localeCompare(b.path)),
    clicks,
    links: rows.links.map((r) => ({ target: str(r.target), count: num(r.n) })).filter((r) => r.target),
    referrers,
  };
}

export class AnalyticsUnavailable extends Error {
  constructor(readonly detail: string) {
    super(`Analytics Engine query failed: ${detail}`);
    this.name = "AnalyticsUnavailable";
  }
}

const QUERY_TIMEOUT_MS = 5000;

/** Run every query in parallel against the SQL API. Any failure fails the whole answer (no half-filled page). */
export async function runQueries(queries: Record<QueryName, string>, accountId: string, token: string, doFetch: typeof fetch): Promise<Record<QueryName, Rows>> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`;
  const entries = await Promise.all(
    (Object.entries(queries) as [QueryName, string][]).map(async ([name, sql]) => {
      let res: Response;
      try {
        res = await doFetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: sql, signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) });
      } catch (e) {
        throw new AnalyticsUnavailable(`${name}: ${e instanceof Error ? e.name : "network error"}`);
      }
      if (!res.ok) throw new AnalyticsUnavailable(`${name}: HTTP ${res.status}`);
      let body: { data?: Rows };
      try {
        body = await res.json();
      } catch {
        throw new AnalyticsUnavailable(`${name}: response was not JSON`);
      }
      return [name, Array.isArray(body.data) ? body.data : []] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<QueryName, Rows>;
}

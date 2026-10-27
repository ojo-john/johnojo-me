/**
 * Request handlers behind the Pages Functions in functions/api/. Kept here, free of any Cloudflare
 * import, so they can be unit-tested with plain Request objects.
 */
import { verifyAccess, type AccessDeps } from "./access";
import { json, log, type MetricsEnv } from "./cf";
import { parseEvent, toDataPoint, LIMITS } from "./events";
import { AnalyticsUnavailable, buildQueries, isSafeDataset, parseRange, runQueries, shapeMetrics } from "./query";
import { createRateLimiter } from "./ratelimit";

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|httpclient/i;
const sharedLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

const requestId = (req: Request) => req.headers.get("cf-ray") ?? crypto.randomUUID();
const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export interface CollectDeps {
  allow: (key: string) => boolean;
}

/**
 * POST /hit. Answers 204 for anything it chooses not to count (metrics off, bots, Do Not Track),
 * so the tracker never needs to care; real input problems get 4xx so they show in the logs.
 */
export async function handleCollect(req: Request, env: MetricsEnv, deps: CollectDeps = { allow: sharedLimiter }): Promise<Response> {
  const id = requestId(req);
  if (req.method !== "POST") return json(405, { error: "method-not-allowed" }, { Allow: "POST" });
  if (env.METRICS_ENABLED !== "true" || !env.METRICS) return noContent();

  // Only the site's own pages may send events.
  const allowed = (env.METRICS_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  let originHost = "";
  try {
    originHost = new URL(req.headers.get("origin") ?? "").host.toLowerCase();
  } catch {
    originHost = "";
  }
  if (!allowed.includes(originHost)) {
    log("warn", { route: "collect", outcome: "rejected", reason: "origin", requestId: id });
    return json(403, { error: "origin-not-allowed" });
  }
  // The browser's privacy signals are honoured here too, in case a tracker copy ignored them.
  if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") return noContent();
  if (BOT_UA.test(req.headers.get("user-agent") ?? "bot")) return noContent();
  if (Number(req.headers.get("content-length") ?? 0) > LIMITS.bodyBytes) return json(413, { error: "too-large" });

  // The IP is only a key in memory for the rate limit; it is never stored or logged.
  if (!deps.allow(req.headers.get("cf-connecting-ip") ?? "unknown")) {
    log("warn", { route: "collect", outcome: "rate-limited", requestId: id });
    return json(429, { error: "too-many-requests" }, { "Retry-After": "60" });
  }

  const body = await req.text();
  const event = parseEvent(body);
  if (!event) {
    log("warn", { route: "collect", outcome: "rejected", reason: "invalid-event", requestId: id });
    return json(400, { error: "invalid-event" });
  }
  try {
    env.METRICS.writeDataPoint(toDataPoint(event));
  } catch (e) {
    log("error", { route: "collect", outcome: "write-failed", error: e instanceof Error ? e.name : "unknown", requestId: id });
    return json(500, { error: "write-failed" });
  }
  return noContent();
}

/**
 * GET /api/metrics?days=7|30. Cloudflare Access must sit in front of this path; the token it adds is
 * verified here as well, before anything else, and every failure denies.
 */
export async function handleMetrics(req: Request, env: MetricsEnv, access: AccessDeps, doFetch: typeof fetch, now: () => Date = () => new Date()): Promise<Response> {
  const id = requestId(req);
  const started = Date.now();
  if (req.method !== "GET") return json(405, { error: "method-not-allowed" }, { Allow: "GET" });

  const gate = await verifyAccess(req.headers.get("cf-access-jwt-assertion"), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD, access);
  if (!gate.ok) {
    log(gate.status === 403 ? "warn" : "error", { route: "metrics", outcome: "denied", reason: gate.reason, requestId: id });
    return json(gate.status, { error: gate.status === 403 ? "forbidden" : gate.reason });
  }

  const days = parseRange(new URL(req.url).searchParams.get("days"));
  if (days === null) return json(400, { error: "days must be 7 or 30" });
  if (env.METRICS_ENABLED !== "true" || !isSafeDataset(env.METRICS_DATASET) || !env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    log("warn", { route: "metrics", outcome: "not-configured", requestId: id });
    return json(503, { error: "not-configured" });
  }

  try {
    const rows = await runQueries(buildQueries(env.METRICS_DATASET, days), env.CF_ACCOUNT_ID, env.CF_API_TOKEN, doFetch);
    log("info", { route: "metrics", outcome: "ok", days, latencyMs: Date.now() - started, requestId: id });
    return json(200, shapeMetrics(rows, days, now()));
  } catch (e) {
    if (!(e instanceof AnalyticsUnavailable)) throw e;
    log("error", { route: "metrics", outcome: "analytics-unavailable", detail: e.detail, latencyMs: Date.now() - started, requestId: id });
    return json(502, { error: "analytics-unavailable" });
  }
}

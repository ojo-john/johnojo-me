/**
 * The few Cloudflare runtime types the metrics functions use, declared here so the project needs no
 * extra type package. They match the Workers runtime API.
 */

/** Workers Analytics Engine binding ([[analytics_engine_datasets]] in wrangler.toml). */
export interface AnalyticsEngineDataset {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

/** Settings for /hit and /api/metrics. Set as Pages environment variables / bindings (see wrangler.example.toml). */
export interface MetricsEnv {
  /** "true" turns collection and the metrics API on. Anything else: collect drops events, metrics answers 503. */
  METRICS_ENABLED?: string;
  METRICS?: AnalyticsEngineDataset;
  /** Analytics Engine dataset name, the same one the METRICS binding writes to. */
  METRICS_DATASET?: string;
  /** Comma-separated hosts allowed to send events, e.g. "johnojo.me,www.johnojo.me". */
  METRICS_ALLOWED_HOSTS?: string;
  /** For reading: Cloudflare account id and an API token with Account Analytics: Read only (a secret). */
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  /** Cloudflare Access team domain ("<team>.cloudflareaccess.com") and the application's AUD tag. */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export type PagesFunction<Env> = (context: { request: Request; env: Env }) => Promise<Response>;

/** One structured log line per request outcome. Never includes IPs, emails or bodies. */
export function log(level: "info" | "warn" | "error", fields: Record<string, string | number | boolean>) {
  const line = JSON.stringify({ level, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...headers },
  });

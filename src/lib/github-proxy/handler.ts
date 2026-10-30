/**
 * /api/github/*: the editor's door to GitHub. The editor (Sveltia CMS) reads and saves the site's files
 * through GitHub's API; instead of each browser signing in to GitHub, it calls this proxy, which adds the
 * site's own GitHub token on the server. So the only login is Cloudflare Access (email + one-time code),
 * and the token never reaches a browser.
 *
 * Guards, all of which deny on failure:
 * - The Access token must verify (Access also sits in front of /api/*).
 * - Same-origin only: a page on another site can't make the browser send a save here with John's cookie.
 * - Only this site's repository, the signed-in-user lookup and GraphQL are forwarded, and the token is a
 *   fine-grained one limited to that repository.
 */
import { verifyAccess, type AccessDeps } from "../metrics/access";
import { json, log } from "../metrics/cf";

export interface GitHubProxyEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  SITE_HOST?: string;
  /** "owner/repo". */
  GITHUB_REPO?: string;
  /** Fine-grained token for GITHUB_REPO only (Contents: read and write). A Pages secret. */
  GITHUB_DISPATCH_TOKEN?: string;
}

export const PROXY_PREFIX = "/api/github";
/**
 * The editor treats a custom API address like GitHub Enterprise and adds "/api/v3" to REST calls
 * (config.yml's api_root already ends in it); GitHub.com has no such prefix, so it's removed here.
 */
const ENTERPRISE_REST = "/api/v3";
const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 30_000;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
/** Request headers passed on to GitHub; everything else (cookies, Access headers) stays here. */
const FORWARD_HEADERS = ["accept", "content-type", "if-none-match", "x-github-api-version"];
/** Response headers passed back to the editor. */
const RETURN_HEADERS = ["content-type", "etag", "link", "x-ratelimit-remaining", "x-ratelimit-reset"];

/** Which GitHub API paths the editor may reach. Exported for tests. */
export function allowedPath(path: string, repo: string): boolean {
  if (path.includes("..") || path.includes("//")) return false;
  return path === "/user" || path === "/graphql" || path === `/repos/${repo}` || path.startsWith(`/repos/${repo}/`);
}

/** True when the request came from a page on the site itself. Browsers set these headers; pages can't fake them. */
export function sameOrigin(req: Request, siteHost: string): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === siteHost;
    } catch {
      return false;
    }
  }
  // No browser fetch metadata at all and no Origin: a GET from an old browser. Reads only.
  return req.method === "GET" || req.method === "HEAD";
}

export async function handleGitHubProxy(req: Request, env: GitHubProxyEnv, access: AccessDeps, doFetch: typeof fetch): Promise<Response> {
  const id = req.headers.get("cf-ray") ?? crypto.randomUUID();
  const started = Date.now();
  const gate = await verifyAccess(req.headers.get("cf-access-jwt-assertion"), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD, access);
  if (!gate.ok) {
    log(gate.status === 403 ? "warn" : "error", { route: "github-proxy", outcome: "denied", reason: gate.reason, requestId: id });
    return json(gate.status, { error: gate.status === 403 ? "forbidden" : gate.reason });
  }
  if (!env.SITE_HOST || !sameOrigin(req, env.SITE_HOST)) {
    log("warn", { route: "github-proxy", outcome: "rejected", reason: "cross-site", requestId: id });
    return json(403, { error: "cross-site" });
  }
  const repo = env.GITHUB_REPO ?? "";
  if (!REPO.test(repo) || !env.GITHUB_DISPATCH_TOKEN) {
    log("error", { route: "github-proxy", outcome: "not-configured", requestId: id });
    return json(503, { error: "not-configured" });
  }

  const url = new URL(req.url);
  let path = url.pathname.slice(PROXY_PREFIX.length) || "/";
  if (path === ENTERPRISE_REST || path.startsWith(`${ENTERPRISE_REST}/`)) path = path.slice(ENTERPRISE_REST.length) || "/";
  if (!allowedPath(path, repo)) {
    log("warn", { route: "github-proxy", outcome: "rejected", reason: "path", requestId: id });
    return json(403, { error: "path-not-allowed" });
  }

  const headers = new Headers({ Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, "User-Agent": "johnojo.me-editor" });
  for (const h of FORWARD_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  let upstream: Response;
  try {
    upstream = await doFetch(`${GITHUB_API}${path}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    log("error", { route: "github-proxy", outcome: "github-unreachable", error: e instanceof Error ? e.name : "unknown", method: req.method, latencyMs: Date.now() - started, requestId: id });
    return json(502, { error: "github-unreachable" });
  }
  log(upstream.ok ? "info" : "warn", { route: "github-proxy", outcome: upstream.ok ? "ok" : "github-error", status: upstream.status, method: req.method, latencyMs: Date.now() - started, requestId: id });
  const out = new Headers({ "Cache-Control": "no-store" });
  for (const h of RETURN_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

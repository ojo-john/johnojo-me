/**
 * Guards every /admin/* request (functions/admin/_middleware.ts) before the static admin files are served.
 *
 * Cloudflare Access protects johnojo.me/admin/*, but it can't cover the project's *.pages.dev addresses
 * (they aren't our domain). So any other host is redirected to the real one, where Access applies, and on
 * the real host the Access token is verified here as well: if Access is ever misconfigured, the admin
 * pages and their data files still aren't served. Every failure denies.
 */
import { verifyAccess, type AccessDeps } from "../metrics/access";
import { log } from "../metrics/cf";

export interface AdminGateEnv {
  /** The one host the admin is served on, e.g. "johnojo.me". Unset: nothing under /admin/ is served. */
  SITE_HOST?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
/** Admin pages and their JSON describe unpublished content: never cached or indexed. */
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

const text = (status: number, body: string) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...PRIVATE_HEADERS } });

export async function gateAdmin(req: Request, env: AdminGateEnv, access: AccessDeps, next: () => Promise<Response>): Promise<Response> {
  const url = new URL(req.url);
  const id = req.headers.get("cf-ray") ?? crypto.randomUUID();
  if (!env.SITE_HOST || !HOST.test(env.SITE_HOST)) {
    log("error", { route: "admin", outcome: "denied", reason: "site-host-not-configured", requestId: id });
    return text(503, "The admin isn't configured.");
  }
  if (url.hostname !== env.SITE_HOST) {
    // *.pages.dev, previews, www: send to the host Access protects. Path and query are kept; nothing is served here.
    return new Response(null, { status: 308, headers: { Location: `https://${env.SITE_HOST}${url.pathname}${url.search}`, ...PRIVATE_HEADERS } });
  }
  const result = await verifyAccess(req.headers.get("cf-access-jwt-assertion"), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD, access);
  if (!result.ok) {
    log(result.status === 403 ? "warn" : "error", { route: "admin", outcome: "denied", reason: result.reason, requestId: id });
    return text(result.status, result.status === 403 ? "Sign in through Cloudflare Access to use the admin." : "The admin is temporarily unavailable.");
  }
  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(PRIVATE_HEADERS)) out.headers.set(k, v);
  return out;
}

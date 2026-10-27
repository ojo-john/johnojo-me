/**
 * "Sign in with GitHub" for the editor (Sveltia CMS), served by the site itself at /oauth/auth and
 * /oauth/callback. GitHub's OAuth flow needs a server that holds the app's client secret; this is it.
 *
 * Ported from sveltia-cms-auth (MIT, https://github.com/sveltia/sveltia-cms-auth), GitHub only, with an
 * explicit timeout on the token exchange. Flow: the editor opens /oauth/auth in a popup → GitHub's consent
 * screen → GitHub redirects to /oauth/callback with a code → the code is swapped for a token → a tiny page
 * hands the token to the editor window by postMessage, and only if that window is on SITE_HOST.
 */
import { log } from "../metrics/cf";

export interface OAuthEnv {
  GITHUB_CLIENT_ID?: string;
  /** A secret. Never logged, never sent to the browser. */
  GITHUB_CLIENT_SECRET?: string;
  /** The only site allowed to receive a token, e.g. "johnojo.me". */
  SITE_HOST?: string;
}

/** What the editor needs to read and save content in the private repo. */
const DEFAULT_SCOPE = "repo,user";
/** Narrower scopes a client may ask for; anything else falls back to the default (never wider). */
const ALLOWED_SCOPES = new Set(["repo", "public_repo", "user", "read:user", "user:email"]);
const CSRF_COOKIE = "oauth-csrf";
const CSRF_TTL_S = 600;
const TOKEN_TIMEOUT_MS = 10_000;
const GITHUB = "https://github.com";

const scopeFor = (requested: string | null) => {
  const scopes = (requested ?? "").split(/[\s,]+/).filter(Boolean);
  return scopes.length && scopes.every((s) => ALLOWED_SCOPES.has(s)) ? scopes.join(",") : DEFAULT_SCOPE;
};

/** Safe inside an inline <script>: no "</script>" or HTML can break out. */
const literal = (v: unknown) => JSON.stringify(v ?? null).replaceAll("<", "\\u003c");

/**
 * The popup's last page. It answers the editor's "authorizing:github" handshake; the browser sets the
 * message origin, so it can't be faked, and a token is only ever posted back to SITE_HOST.
 */
function resultPage(host: string, result: { token: string } | { error: string; errorCode: string }): Response {
  const state = "token" in result ? "success" : "error";
  const content = "token" in result ? { provider: "github", token: result.token } : { provider: "github", ...result };
  const message = `authorization:github:${state}:${JSON.stringify(content)}`;
  const html = `<!doctype html><html><body><script>
(() => {
  const host = ${literal(host)};
  const hasToken = ${literal(state === "success")};
  const message = ${literal(message)};
  window.addEventListener("message", ({ data, origin }) => {
    if (data !== "authorizing:github") return;
    let trusted = false;
    try { trusted = new URL(origin).hostname === host; } catch {}
    if (hasToken && !trusted) return;
    window.opener?.postMessage(message, origin);
  });
  window.opener?.postMessage("authorizing:github", "*");
})();
</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": `${CSRF_COOKIE}=deleted; HttpOnly; Secure; SameSite=Lax; Path=/oauth/; Max-Age=0`,
    },
  });
}

const fail = (host: string, errorCode: string, error: string) => resultPage(host, { error, errorCode });

/** GET /oauth/auth?provider=github&site_id=<host>&scope=… : starts the flow. */
export function handleAuth(req: Request, env: OAuthEnv, randomHex: () => string = () => crypto.randomUUID().replaceAll("-", "")): Response {
  const q = new URL(req.url).searchParams;
  const host = env.SITE_HOST ?? "";
  if (q.get("provider") !== "github") return fail(host, "UNSUPPORTED_BACKEND", "Only GitHub sign-in is supported.");
  if (!host || q.get("site_id") !== host) return fail(host, "UNSUPPORTED_DOMAIN", "This site isn't allowed to use this sign-in.");
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    log("error", { route: "oauth", outcome: "not-configured" });
    return fail(host, "MISCONFIGURED_CLIENT", "GitHub sign-in isn't configured yet.");
  }
  const csrf = randomHex();
  const params = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, scope: scopeFor(q.get("scope")), state: csrf });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${GITHUB}/login/oauth/authorize?${params}`,
      "Cache-Control": "no-store",
      "Set-Cookie": `${CSRF_COOKIE}=${csrf}; HttpOnly; Secure; SameSite=Lax; Path=/oauth/; Max-Age=${CSRF_TTL_S}`,
    },
  });
}

/** GET /oauth/callback?code=…&state=… : GitHub's redirect; swaps the code for a token. */
export async function handleCallback(req: Request, env: OAuthEnv, doFetch: typeof fetch): Promise<Response> {
  const host = env.SITE_HOST ?? "";
  const q = new URL(req.url).searchParams;
  const code = q.get("code");
  const state = q.get("state");
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([0-9a-f]{32})(?:;|$)`))?.[1];
  if (!code || !state) return fail(host, "AUTH_CODE_REQUEST_FAILED", "GitHub didn't return a sign-in code. Please try again.");
  if (!cookie || cookie !== state) {
    log("warn", { route: "oauth", outcome: "csrf-mismatch" });
    return fail(host, "CSRF_DETECTED", "The sign-in couldn't be verified. Please start again.");
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return fail(host, "MISCONFIGURED_CLIENT", "GitHub sign-in isn't configured yet.");

  const started = Date.now();
  let body: { access_token?: string; error?: string };
  try {
    const res = await doFetch(`${GITHUB}/login/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ code, client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`token endpoint answered ${res.status}`);
    body = await res.json();
  } catch (e) {
    log("error", { route: "oauth", outcome: "token-request-failed", error: e instanceof Error ? e.name : "unknown", latencyMs: Date.now() - started });
    return fail(host, "TOKEN_REQUEST_FAILED", "Couldn't reach GitHub. Please try again.");
  }
  if (!body.access_token) {
    log("warn", { route: "oauth", outcome: "no-token", reason: body.error ?? "none", latencyMs: Date.now() - started });
    return fail(host, "TOKEN_REQUEST_FAILED", "GitHub didn't issue a token. Please try again.");
  }
  log("info", { route: "oauth", outcome: "ok", latencyMs: Date.now() - started });
  return resultPage(host, { token: body.access_token });
}

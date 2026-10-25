/**
 * Cloudflare Access check for /api/metrics. Access already blocks anyone who isn't John before the
 * request reaches the function; this verifies the signed token Access adds (Cf-Access-Jwt-Assertion),
 * so a misconfigured or missing Access policy can't expose the numbers. Every failure denies.
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */

export type AccessResult = { ok: true } | { ok: false; status: 403 | 500 | 503; reason: string };

export interface AccessDeps {
  fetch: typeof fetch;
  /** Milliseconds since the epoch. Injected so tests control time. */
  now: () => number;
  /** Signing keys by team domain, kept for a few minutes so most requests need no extra fetch. */
  cache: Map<string, { keys: Map<string, CryptoKey>; fetchedAt: number }>;
}

const TEAM_DOMAIN = /^[a-z0-9-]+\.cloudflareaccess\.com$/;
const AUD = /^[a-f0-9]{64}$/;
const KEYS_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
/** Small allowance for clock differences between Cloudflare's machines. */
const CLOCK_SKEW_S = 60;

export const defaultAccessDeps = (): AccessDeps => ({ fetch: (...a) => fetch(...a), now: Date.now, cache: sharedCache });
const sharedCache: AccessDeps["cache"] = new Map();

class KeysUnavailable extends Error {}

const b64urlBytes = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64urlJson = (s: string): unknown => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function signingKeys(teamDomain: string, deps: AccessDeps, force: boolean): Promise<Map<string, CryptoKey>> {
  const cached = deps.cache.get(teamDomain);
  if (cached && !force && deps.now() - cached.fetchedAt < KEYS_TTL_MS) return cached.keys;
  let body: { keys?: (JsonWebKey & { kid?: string })[] };
  try {
    const res = await deps.fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new KeysUnavailable(`certs answered ${res.status}`);
    body = await res.json();
  } catch (e) {
    throw e instanceof KeysUnavailable ? e : new KeysUnavailable(e instanceof Error ? e.name : "fetch failed");
  }
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid || jwk.kty !== "RSA") continue;
    keys.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  deps.cache.set(teamDomain, { keys, fetchedAt: deps.now() });
  return keys;
}

const deny = (reason: string): AccessResult => ({ ok: false, status: 403, reason });

export async function verifyAccess(token: string | null, teamDomain: string | undefined, aud: string | undefined, deps: AccessDeps): Promise<AccessResult> {
  // Without settings there's nothing to check against, so nothing is served.
  if (!teamDomain || !TEAM_DOMAIN.test(teamDomain) || !aud || !AUD.test(aud)) return { ok: false, status: 500, reason: "access-not-configured" };
  if (!token) return deny("missing-token");

  const parts = token.split(".");
  if (parts.length !== 3) return deny("malformed-token");
  let header: { alg?: string; kid?: string };
  let claims: { iss?: string; aud?: string | string[]; exp?: number; nbf?: number };
  try {
    header = b64urlJson(parts[0]) as typeof header;
    claims = b64urlJson(parts[1]) as typeof claims;
  } catch {
    return deny("malformed-token");
  }
  if (header.alg !== "RS256" || !header.kid) return deny("unsupported-algorithm");

  let key: CryptoKey | undefined;
  try {
    key = (await signingKeys(teamDomain, deps, false)).get(header.kid);
    // Access rotates keys; an unknown key id is worth one fresh look before denying.
    if (!key) key = (await signingKeys(teamDomain, deps, true)).get(header.kid);
  } catch (e) {
    if (e instanceof KeysUnavailable) return { ok: false, status: 503, reason: "access-keys-unavailable" };
    throw e;
  }
  if (!key) return deny("unknown-key");

  let valid = false;
  try {
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {
    valid = false;
  }
  if (!valid) return deny("bad-signature");

  const nowS = deps.now() / 1000;
  if (claims.iss !== `https://${teamDomain}`) return deny("wrong-issuer");
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return deny("wrong-audience");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < nowS) return deny("expired");
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > nowS) return deny("not-yet-valid");
  return { ok: true };
}

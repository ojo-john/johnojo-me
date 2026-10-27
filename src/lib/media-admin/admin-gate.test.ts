import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessDeps } from "../metrics/access";
import { gateAdmin, type AdminGateEnv } from "./admin-gate";

vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const TEAM = "johnojo.cloudflareaccess.com";
const AUD = "c".repeat(64);
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
let publicJwk: JsonWebKey;
let goodToken = "";

const b64url = (v: Uint8Array | string) => Buffer.from(typeof v === "string" ? new TextEncoder().encode(v) : v).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1" }));
  const c = b64url(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 3600 }));
  goodToken = `${h}.${c}.${b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${c}`))))}`;
});
const access = (): AccessDeps => ({ now: () => NOW, cache: new Map(), fetch: (async () => Response.json({ keys: [{ ...publicJwk, kid: "k1" }] })) as unknown as typeof fetch });
const env = (over: Partial<AdminGateEnv> = {}): AdminGateEnv => ({ SITE_HOST: "johnojo.me", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ...over });
const req = (url: string, token?: string) => new Request(url, { headers: token ? { "cf-access-jwt-assertion": token } : {} });
/** Stands in for the static admin file; records whether it was served. */
function asset() {
  const calls = { n: 0 };
  return { calls, next: async () => (calls.n++, new Response("<h1>admin</h1>", { headers: { "Cache-Control": "public, max-age=600" } })) };
}

describe("gateAdmin", () => {
  it("gateAdmin_pagesDevHost_redirectsToRealHostWithoutServing", async () => {
    const a = asset();
    const res = await gateAdmin(req("https://johnojo-me.pages.dev/admin/media.json?x=1", goodToken), env(), access(), a.next);
    expect([res.status, res.headers.get("location"), a.calls.n]).toEqual([308, "https://johnojo.me/admin/media.json?x=1", 0]);
  });

  it("gateAdmin_previewDeploymentHost_redirects", async () => {
    const res = await gateAdmin(req("https://abc123.johnojo-me.pages.dev/admin/"), env(), access(), asset().next);
    expect(res.status).toBe(308);
  });

  it("gateAdmin_realHostWithoutLogin_isDenied", async () => {
    const a = asset();
    const res = await gateAdmin(req("https://johnojo.me/admin/"), env(), access(), a.next);
    expect([res.status, a.calls.n]).toEqual([403, 0]);
  });

  it("gateAdmin_forgedToken_isDenied", async () => {
    const res = await gateAdmin(req("https://johnojo.me/admin/", `${goodToken.split(".").slice(0, 2).join(".")}.AAAA`), env(), access(), asset().next);
    expect(res.status).toBe(403);
  });

  it("gateAdmin_validLogin_servesFileUncached", async () => {
    const res = await gateAdmin(req("https://johnojo.me/admin/", goodToken), env(), access(), asset().next);
    expect([res.status, await res.text(), res.headers.get("cache-control")]).toEqual([200, "<h1>admin</h1>", "private, no-store"]);
  });

  it("gateAdmin_siteHostUnset_failsClosed", async () => {
    const a = asset();
    const res = await gateAdmin(req("https://johnojo.me/admin/", goodToken), env({ SITE_HOST: undefined }), access(), a.next);
    expect([res.status, a.calls.n]).toEqual([503, 0]);
  });

  it("gateAdmin_accessNotConfigured_failsClosed", async () => {
    const res = await gateAdmin(req("https://johnojo.me/admin/", goodToken), env({ ACCESS_AUD: undefined }), access(), asset().next);
    expect(res.status).toBe(500);
  });

  it("gateAdmin_signingKeysUnreachable_failsClosed", async () => {
    const down: AccessDeps = { ...access(), fetch: (async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch };
    const res = await gateAdmin(req("https://johnojo.me/admin/", goodToken), env(), down, asset().next);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});

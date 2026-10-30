import { beforeAll, describe, expect, it } from "vitest";
import type { AccessDeps } from "../metrics/access";
import { allowedPath, handleGitHubProxy, sameOrigin, type GitHubProxyEnv } from "./handler";

const TEAM = "johnojo.cloudflareaccess.com";
const AUD = "a".repeat(64);
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const REPO = "ojo-john/johnojo-me";
const env: GitHubProxyEnv = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, SITE_HOST: "johnojo.me", GITHUB_REPO: REPO, GITHUB_DISPATCH_TOKEN: "site-token" };

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
});

/** A token like the one Cloudflare Access adds for a signed-in John. */
async function accessToken() {
  const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1" }));
  const c = b64url(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 3600, nbf: NOW / 1000 - 10 }));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${c}`)));
  return `${h}.${c}.${b64url(sig)}`;
}
const access = (): AccessDeps => ({ now: () => NOW, cache: new Map(), fetch: (async () => Response.json({ keys: [{ ...publicJwk, kid: "k1" }] })) as unknown as typeof fetch });

/** A fake GitHub that records what it was sent. */
function github(respond: () => Promise<Response> = async () => Response.json({ login: "ojo-john" }, { headers: { etag: '"e1"', "set-cookie": "x=1" } })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => (calls.push({ url, init }), respond())) as unknown as typeof fetch;
  return { calls, doFetch };
}

async function request(path: string, init: RequestInit & { signedIn?: boolean; site?: string } = {}) {
  const { signedIn = true, site = "same-origin", ...rest } = init;
  const headers = new Headers(rest.headers);
  if (signedIn) headers.set("cf-access-jwt-assertion", await accessToken());
  if (site) headers.set("sec-fetch-site", site);
  return new Request(`https://johnojo.me/api/github${path}`, { ...rest, headers });
}

describe("allowedPath", () => {
  it("allowedPath_thisRepository_isAllowed", () => {
    expect(allowedPath(`/repos/${REPO}/git/trees/main`, REPO)).toBe(true);
  });

  it("allowedPath_anotherRepository_isDenied", () => {
    expect(allowedPath("/repos/ojo-john/other/contents/x", REPO)).toBe(false);
  });

  it("allowedPath_repoNamePrefixTrick_isDenied", () => {
    expect(allowedPath(`/repos/${REPO}-evil/contents`, REPO)).toBe(false);
  });

  it("allowedPath_dotDotSegment_isDenied", () => {
    expect(allowedPath(`/repos/${REPO}/../other`, REPO)).toBe(false);
  });

  it("allowedPath_userAndGraphql_areAllowed", () => {
    expect([allowedPath("/user", REPO), allowedPath("/graphql", REPO)]).toEqual([true, true]);
  });

  it("allowedPath_otherApi_isDenied", () => {
    expect(allowedPath("/user/repos", REPO)).toBe(false);
  });
});

describe("sameOrigin", () => {
  it("sameOrigin_crossSiteFetchMetadata_isRejected", () => {
    expect(sameOrigin(new Request("https://johnojo.me/api/github/user", { headers: { "sec-fetch-site": "cross-site" } }), "johnojo.me")).toBe(false);
  });

  it("sameOrigin_postWithoutAnyBrowserHeaders_isRejected", () => {
    expect(sameOrigin(new Request("https://johnojo.me/api/github/graphql", { method: "POST" }), "johnojo.me")).toBe(false);
  });

  it("sameOrigin_matchingOriginHeader_isAccepted", () => {
    expect(sameOrigin(new Request("https://johnojo.me/api/github/graphql", { method: "POST", headers: { origin: "https://johnojo.me" } }), "johnojo.me")).toBe(true);
  });
});

describe("handleGitHubProxy", () => {
  it("handleGitHubProxy_notSignedIn_denies403WithoutCallingGitHub", async () => {
    const gh = github();
    const res = await handleGitHubProxy(await request("/user", { signedIn: false }), env, access(), gh.doFetch);
    expect([res.status, gh.calls.length]).toEqual([403, 0]);
  });

  it("handleGitHubProxy_crossSiteRequest_denied", async () => {
    const gh = github();
    const res = await handleGitHubProxy(await request("/graphql", { method: "POST", body: "{}", site: "cross-site" }), env, access(), gh.doFetch);
    expect([res.status, gh.calls.length]).toEqual([403, 0]);
  });

  it("handleGitHubProxy_tokenNotSet_failsClosed503", async () => {
    const res = await handleGitHubProxy(await request("/user"), { ...env, GITHUB_DISPATCH_TOKEN: undefined }, access(), github().doFetch);
    expect(res.status).toBe(503);
  });

  it("handleGitHubProxy_pathOutsideRepository_denied", async () => {
    const gh = github();
    const res = await handleGitHubProxy(await request("/repos/someone/else/contents/a"), env, access(), gh.doFetch);
    expect([res.status, gh.calls.length]).toEqual([403, 0]);
  });

  it("handleGitHubProxy_allowedRequest_usesServerTokenNotTheBrowsers", async () => {
    const gh = github();
    await handleGitHubProxy(await request("/user", { headers: { authorization: "token from-browser", cookie: "CF_Authorization=abc" } }), env, access(), gh.doFetch);
    const sent = new Headers(gh.calls[0].init.headers);
    expect([gh.calls[0].url, sent.get("authorization"), sent.get("cookie")]).toEqual(["https://api.github.com/user", "Bearer site-token", null]);
  });

  it("handleGitHubProxy_enterpriseStylePrefix_isRemoved", async () => {
    const gh = github();
    await handleGitHubProxy(await request(`/api/v3/repos/${REPO}/git/trees/main`), env, access(), gh.doFetch);
    expect(gh.calls[0].url).toBe(`https://api.github.com/repos/${REPO}/git/trees/main`);
  });

  it("handleGitHubProxy_query_isKeptOnTheForwardedUrl", async () => {
    const gh = github();
    await handleGitHubProxy(await request(`/repos/${REPO}/commits?sha=main&per_page=1`), env, access(), gh.doFetch);
    expect(gh.calls[0].url).toBe(`https://api.github.com/repos/${REPO}/commits?sha=main&per_page=1`);
  });

  it("handleGitHubProxy_githubResponse_passesStatusAndSafeHeadersOnly", async () => {
    const res = await handleGitHubProxy(await request("/user"), env, access(), github().doFetch);
    expect([res.status, res.headers.get("etag"), res.headers.get("set-cookie"), res.headers.get("cache-control")]).toEqual([200, '"e1"', null, "no-store"]);
  });

  it("handleGitHubProxy_githubUnreachable_answers502", async () => {
    const gh = github(async () => {
      throw new TypeError("network down");
    });
    const res = await handleGitHubProxy(await request("/user"), env, access(), gh.doFetch);
    expect(res.status).toBe(502);
  });

  it("handleGitHubProxy_githubError_isPassedThrough", async () => {
    const res = await handleGitHubProxy(await request(`/repos/${REPO}/contents/x`), env, access(), github(async () => new Response("{}", { status: 409 })).doFetch);
    expect(res.status).toBe(409);
  });
});

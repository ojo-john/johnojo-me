import { describe, expect, it, vi } from "vitest";
import { handleAuth, handleCallback, type OAuthEnv } from "./relay";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const CSRF = "a".repeat(32);
const env = (over: Partial<OAuthEnv> = {}): OAuthEnv => ({ GITHUB_CLIENT_ID: "cid", GITHUB_CLIENT_SECRET: "secret", SITE_HOST: "johnojo.me", ...over });
const auth = (qs: string, e = env()) => handleAuth(new Request(`https://johnojo.me/oauth/auth?${qs}`), e, () => CSRF);
const callback = (qs: string, cookie: string | null, doFetch: typeof fetch, e = env()) =>
  handleCallback(new Request(`https://johnojo.me/oauth/callback?${qs}`, { headers: cookie ? { cookie } : {} }), e, doFetch);
const github = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch;
const neverCalled = (async () => {
  throw new Error("should not be called");
}) as unknown as typeof fetch;

describe("handleAuth", () => {
  it("handleAuth_validRequest_redirectsToGitHubWithCsrfCookie", () => {
    const res = auth("provider=github&site_id=johnojo.me");
    const to = new URL(res.headers.get("location") ?? "");
    expect([res.status, to.origin + to.pathname, to.searchParams.get("state"), to.searchParams.get("scope"), res.headers.get("set-cookie")?.startsWith(`oauth-csrf=${CSRF};`)]).toEqual([
      302,
      "https://github.com/login/oauth/authorize",
      CSRF,
      "repo,user",
      true,
    ]);
  });

  it("handleAuth_otherSite_isRefused", async () => {
    const res = auth("provider=github&site_id=evil.example");
    expect([res.status, await res.text()]).toEqual([200, expect.stringContaining("UNSUPPORTED_DOMAIN")]);
  });

  it("handleAuth_otherProvider_isRefused", async () => {
    expect(await auth("provider=gitlab&site_id=johnojo.me").text()).toContain("UNSUPPORTED_BACKEND");
  });

  it("handleAuth_clientSecretMissing_isRefused", async () => {
    expect(await auth("provider=github&site_id=johnojo.me", env({ GITHUB_CLIENT_SECRET: undefined })).text()).toContain("MISCONFIGURED_CLIENT");
  });

  it("handleAuth_narrowerScope_isKept", () => {
    const to = new URL(auth("provider=github&site_id=johnojo.me&scope=public_repo").headers.get("location") ?? "");
    expect(to.searchParams.get("scope")).toBe("public_repo");
  });

  it("handleAuth_widerScopeRequested_fallsBackToDefault", () => {
    const to = new URL(auth("provider=github&site_id=johnojo.me&scope=repo,workflow,admin:org").headers.get("location") ?? "");
    expect(to.searchParams.get("scope")).toBe("repo,user");
  });
});

describe("handleCallback", () => {
  const ok = `code=c1&state=${CSRF}`;
  const cookie = `other=1; oauth-csrf=${CSRF}`;

  it("handleCallback_validCode_postsTokenOnlyToSiteHost", async () => {
    const html = await (await callback(ok, cookie, github({ access_token: "gho_abc" }))).text();
    expect([html.includes("gho_abc"), html.includes(`const host = "johnojo.me"`), html.includes("if (hasToken && !trusted) return;")]).toEqual([true, true, true]);
  });

  it("handleCallback_stateDoesNotMatchCookie_isRefusedWithoutCallingGitHub", async () => {
    const html = await (await callback(`code=c1&state=${"b".repeat(32)}`, cookie, neverCalled)).text();
    expect(html).toContain("CSRF_DETECTED");
  });

  it("handleCallback_noCookie_isRefused", async () => {
    expect(await (await callback(ok, null, neverCalled)).text()).toContain("CSRF_DETECTED");
  });

  it("handleCallback_missingCode_isRefused", async () => {
    expect(await (await callback(`state=${CSRF}`, cookie, neverCalled)).text()).toContain("AUTH_CODE_REQUEST_FAILED");
  });

  it("handleCallback_gitHubUnreachable_failsWithoutToken", async () => {
    const down = (async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    expect(await (await callback(ok, cookie, down)).text()).toContain("TOKEN_REQUEST_FAILED");
  });

  it("handleCallback_gitHubServerError_fails", async () => {
    expect(await (await callback(ok, cookie, github({}, 502))).text()).toContain("TOKEN_REQUEST_FAILED");
  });

  it("handleCallback_gitHubRejectsCode_fails", async () => {
    expect(await (await callback(ok, cookie, github({ error: "bad_verification_code" }))).text()).toContain("TOKEN_REQUEST_FAILED");
  });

  it("handleCallback_anyOutcome_clearsCsrfCookieAndIsNeverCached", async () => {
    const res = await callback(ok, cookie, github({ access_token: "gho_abc" }));
    expect([res.headers.get("set-cookie")?.includes("Max-Age=0"), res.headers.get("cache-control")]).toEqual([true, "no-store"]);
  });

  it("handleCallback_tokenWithScriptChars_cannotBreakOutOfScript", async () => {
    const html = await (await callback(ok, cookie, github({ access_token: "</script><img src=x>" }))).text();
    expect(html).not.toContain("</script><img");
  });
});

import { describe, expect, it, vi } from "vitest";
import type { AccessDeps } from "./access";
import type { MetricsEnv } from "./cf";
import { handleCollect, handleMetrics } from "./handlers";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const UA = "Mozilla/5.0 (Macintosh) Chrome/140";
const body = JSON.stringify({ type: "page_view", path: "/travel/", ref: "" });

function collectEnv(over: Partial<MetricsEnv> = {}) {
  const writes: unknown[] = [];
  const env: MetricsEnv = { METRICS_ENABLED: "true", METRICS_ALLOWED_HOSTS: "johnojo.me", METRICS: { writeDataPoint: (p) => void writes.push(p) }, ...over };
  return { env, writes };
}
const post = (headers: Record<string, string> = {}, data = body) =>
  new Request("https://johnojo.me/hit", { method: "POST", body: data, headers: { origin: "https://johnojo.me", "user-agent": UA, "content-type": "text/plain", ...headers } });
const allowAll = { allow: () => true };

describe("handleCollect", () => {
  it("handleCollect_metricsDisabled_dropsSilently", async () => {
    const { env, writes } = collectEnv({ METRICS_ENABLED: "false" });
    const res = await handleCollect(post(), env, allowAll);
    expect([res.status, writes.length]).toEqual([204, 0]);
  });

  it("handleCollect_noBinding_dropsSilently", async () => {
    const { env } = collectEnv({ METRICS: undefined });
    expect((await handleCollect(post(), env, allowAll)).status).toBe(204);
  });

  it("handleCollect_foreignOrigin_isRejected", async () => {
    const { env, writes } = collectEnv();
    const res = await handleCollect(post({ origin: "https://evil.example" }), env, allowAll);
    expect([res.status, writes.length]).toEqual([403, 0]);
  });

  it("handleCollect_noOrigin_isRejected", async () => {
    const req = new Request("https://johnojo.me/hit", { method: "POST", body, headers: { "user-agent": UA } });
    expect((await handleCollect(req, collectEnv().env, allowAll)).status).toBe(403);
  });

  it("handleCollect_doNotTrackHeader_isNotCounted", async () => {
    const { env, writes } = collectEnv();
    const res = await handleCollect(post({ dnt: "1" }), env, allowAll);
    expect([res.status, writes.length]).toEqual([204, 0]);
  });

  it("handleCollect_globalPrivacyControlHeader_isNotCounted", async () => {
    const { env, writes } = collectEnv();
    await handleCollect(post({ "sec-gpc": "1" }), env, allowAll);
    expect(writes).toEqual([]);
  });

  it("handleCollect_bot_isNotCounted", async () => {
    const { env, writes } = collectEnv();
    await handleCollect(post({ "user-agent": "Googlebot/2.1" }), env, allowAll);
    expect(writes).toEqual([]);
  });

  it("handleCollect_rateLimited_returns429", async () => {
    expect((await handleCollect(post(), collectEnv().env, { allow: () => false })).status).toBe(429);
  });

  it("handleCollect_invalidEvent_returns400", async () => {
    const { env, writes } = collectEnv();
    const res = await handleCollect(post({}, '{"type":"page_view","path":"https://x"}'), env, allowAll);
    expect([res.status, writes.length]).toEqual([400, 0]);
  });

  it("handleCollect_writeThrows_returns500", async () => {
    const { env } = collectEnv({
      METRICS: {
        writeDataPoint: () => {
          throw new Error("binding broken");
        },
      },
    });
    expect((await handleCollect(post(), env, allowAll)).status).toBe(500);
  });

  it("handleCollect_wrongMethod_returns405", async () => {
    expect((await handleCollect(new Request("https://johnojo.me/hit"), collectEnv().env, allowAll)).status).toBe(405);
  });

  it("handleCollect_validPageView_isCounted", async () => {
    const { env, writes } = collectEnv();
    const res = await handleCollect(post({ origin: "https://johnojo.me" }), env, allowAll);
    expect([res.status, writes]).toEqual([204, [{ blobs: ["page_view", "/travel/", "", "", ""], doubles: [1], indexes: ["page_view"] }]]);
  });
});

describe("handleMetrics", () => {
  const denyingAccess: AccessDeps = {
    now: () => 0,
    cache: new Map(),
    fetch: (async () => {
      throw new Error("must not be called without a token");
    }) as unknown as typeof fetch,
  };
  const neverQuery = (async () => {
    throw new Error("queried analytics before access was verified");
  }) as unknown as typeof fetch;
  const env: MetricsEnv = { METRICS_ENABLED: "true", METRICS_DATASET: "johnojo_metrics", CF_ACCOUNT_ID: "acct", CF_API_TOKEN: "t", ACCESS_TEAM_DOMAIN: "johnojo.cloudflareaccess.com", ACCESS_AUD: "a".repeat(64) };

  it("handleMetrics_noAccessToken_denies403BeforeQuerying", async () => {
    const res = await handleMetrics(new Request("https://johnojo.me/api/metrics"), env, denyingAccess, neverQuery);
    expect([res.status, await res.json()]).toEqual([403, { error: "forbidden" }]);
  });

  it("handleMetrics_accessNotConfigured_failsClosed", async () => {
    const res = await handleMetrics(new Request("https://johnojo.me/api/metrics", { headers: { "cf-access-jwt-assertion": "x.y.z" } }), { ...env, ACCESS_AUD: undefined }, denyingAccess, neverQuery);
    expect(res.status).toBe(500);
  });

  it("handleMetrics_responses_areNeverCached", async () => {
    const res = await handleMetrics(new Request("https://johnojo.me/api/metrics"), env, denyingAccess, neverQuery);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

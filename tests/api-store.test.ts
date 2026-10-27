import { describe, expect, it } from "vitest";
import { apiStore, StorageRequestFailed, type ApiStoreDeps } from "../scripts/lib/store";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
/** A store whose HTTP calls go to `handler`; records every call made. */
function store(handler: Handler, over: Partial<ApiStoreDeps> = {}) {
  const calls: { url: string; auth: string; method: string }[] = [];
  let tokens = 0;
  const s = apiStore({
    account: "acc",
    bucket: "johnojo-media",
    getToken: () => `t${++tokens}`,
    canRenew: true,
    backoffMs: 0,
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: (init?.headers as Record<string, string>).Authorization, method: init?.method ?? "GET" });
      return handler(url, init);
    }) as unknown as typeof fetch,
    ...over,
  });
  return { s, calls };
}
const ok = (result: unknown, info?: unknown) => Response.json({ success: true, result, ...(info ? { result_info: info } : {}) });

describe("apiStore", () => {
  it("put_serverErrorThenSuccess_retriesAndSucceeds", async () => {
    let n = 0;
    const { s, calls } = store(() => (++n === 1 ? new Response("", { status: 503 }) : ok({})));
    await s.put("media/a.jpg", Buffer.from("x"), "image/jpeg");
    expect(calls).toHaveLength(2);
  });

  it("put_accessDenied_failsWithoutRetry", async () => {
    const { s, calls } = store(() => new Response("", { status: 403 }));
    await expect(s.put("media/a.jpg", Buffer.from("x"), "image/jpeg")).rejects.toMatchObject({ retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("get_serverKeepsFailing_givesUpAfterFourAttempts", async () => {
    const { s, calls } = store(() => new Response("", { status: 500 }));
    await expect(s.get("media/a.jpg")).rejects.toBeInstanceOf(StorageRequestFailed);
    expect(calls).toHaveLength(4);
  });

  it("delete_networkDrops_isRetried", async () => {
    let n = 0;
    const { s, calls } = store(() => (++n === 1 ? Promise.reject(new TypeError("fetch failed")) : ok({})));
    await s.delete("media/a.jpg");
    expect(calls).toHaveLength(2);
  });

  it("call_signInExpired_renewsTokenOnce", async () => {
    const { s, calls } = store((_, init) => ((init?.headers as Record<string, string>).Authorization === "Bearer t1" ? new Response("", { status: 401 }) : ok({})));
    await s.delete("media/a.jpg");
    expect(calls.map((c) => c.auth)).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("call_fixedTokenRejected_doesNotRenew", async () => {
    const { s, calls } = store(() => new Response("", { status: 401 }), { canRenew: false });
    await expect(s.delete("media/a.jpg")).rejects.toMatchObject({ retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("list_severalPages_followsCursorAndStripsEtagQuotes", async () => {
    const { s } = store((url) =>
      new URL(url).searchParams.get("cursor") === "c2"
        ? ok([{ key: "b", size: 2, etag: "e2" }], { is_truncated: false })
        : ok([{ key: "a", size: "1", etag: '"e1"' }], { is_truncated: true, cursor: "c2" }),
    );
    expect(await s.list()).toEqual([
      { key: "a", size: 1, etag: "e1" },
      { key: "b", size: 2, etag: "e2" },
    ]);
  });

  it("put_keyWithSpaces_isEncodedPerSegment", async () => {
    const { s, calls } = store(() => ok({}));
    await s.put("europe 2026/rome/photos/IMG 1.jpg", Buffer.from("x"), "image/jpeg");
    expect(calls[0].url).toMatch(/\/objects\/europe%202026\/rome\/photos\/IMG%201\.jpg$/);
  });

  it("put_overApiLimit_refusedBeforeSending", async () => {
    const { s, calls } = store(() => ok({}));
    await expect(s.put("media/big.mp4", Buffer.alloc(300 * 1000 ** 2 + 1), "video/mp4")).rejects.toMatchObject({ retryable: false });
    expect(calls).toHaveLength(0);
  });
});

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessDeps } from "../metrics/access";
import { handlePreview, handleProcess, handleUpload, MAX_UPLOAD_BYTES, parseRange, validOriginalKey, type BucketBinding, type MediaAdminEnv } from "./handlers";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const TEAM = "johnojo.cloudflareaccess.com";
const AUD = "b".repeat(64);
const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
let goodToken = "";

const b64url = (v: Uint8Array | string) => Buffer.from(typeof v === "string" ? new TextEncoder().encode(v) : v).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1" }));
  const c = b64url(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 3600 }));
  goodToken = `${h}.${c}.${b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${c}`))))}`;
});
const access = (): AccessDeps => ({ now: () => NOW, cache: new Map(), fetch: (async () => Response.json({ keys: [{ ...publicJwk, kid: "k1" }] })) as unknown as typeof fetch });

function bucket(failPut = false) {
  const stored = new Map<string, string>();
  const uploads = new Map<string, { key: string; parts: Map<number, string>; done: boolean; aborted: boolean }>();
  const resume = (key: string, uploadId: string) => {
    const u = uploads.get(uploadId);
    if (!u || u.key !== key) throw new Error("NoSuchUpload");
    return {
      uploadId,
      async uploadPart(n: number) {
        u.parts.set(n, `etag-${n}`);
        return { partNumber: n, etag: `etag-${n}` };
      },
      async complete() {
        u.done = true;
        stored.set(key, "x");
      },
      async abort() {
        u.aborted = true;
      },
    };
  };
  const b = {
    keys: [] as string[],
    stored,
    uploads,
    async put(key: string) {
      if (failPut) throw new Error("r2 down");
      stored.set(key, "x");
      b.keys.push(key);
    },
    async head(key: string) {
      return stored.has(key) ? {} : null;
    },
    async get(key: string) {
      return stored.has(key) ? { body: new Blob(["jpeg"]).stream(), size: 1000 } : null;
    },
    async createMultipartUpload(key: string) {
      const uploadId = `u${uploads.size + 1}`;
      uploads.set(uploadId, { key, parts: new Map(), done: false, aborted: false });
      return resume(key, uploadId);
    },
    resumeMultipartUpload: resume,
  };
  return b satisfies BucketBinding;
}
const env = (over: Partial<MediaAdminEnv> = {}): MediaAdminEnv => ({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ORIGINALS: bucket(), GITHUB_REPO: "ojo-john/johnojo-me", GITHUB_DISPATCH_TOKEN: "t", ...over });
const upload = (key: string, { token = goodToken, size = 4 } = {}) =>
  new Request(`https://johnojo.me/api/upload?key=${encodeURIComponent(key)}`, { method: "PUT", body: "abcd", headers: { "cf-access-jwt-assertion": token, "content-length": String(size), "content-type": "image/jpeg" } });

describe("validOriginalKey", () => {
  it("validOriginalKey_pathTraversalOrHiddenFolder_isRejected", () => {
    expect(["../x/photos/a.jpg", "t/../photos/a.jpg", "_previews/c/photos/a.jpg", "t/c/photos/.a.jpg"].map(validOriginalKey)).toEqual([false, false, false, false]);
  });

  it("validOriginalKey_wrongTypeForFolder_isRejected", () => {
    expect([validOriginalKey("t/c/photos/clip.mov"), validOriginalKey("t/c/videos/a.jpg"), validOriginalKey("t/c/docs/a.pdf")]).toEqual([false, false, false]);
  });

  it("validOriginalKey_normalPhotoAndClip_areAccepted", () => {
    expect([validOriginalKey("europe-2026/rome/photos/IMG_1.HEIC"), validOriginalKey("europe-2026/rome/videos/IMG 2.MOV")]).toEqual([true, true]);
  });
});

describe("handleUpload", () => {
  it("handleUpload_noAccessToken_isDeniedAndStoresNothing", async () => {
    const e = env();
    const res = await handleUpload(upload("t/c/photos/a.jpg", { token: "" }), e, access());
    expect([res.status, (e.ORIGINALS as ReturnType<typeof bucket>).keys]).toEqual([403, []]);
  });

  it("handleUpload_accessNotConfigured_failsClosed", async () => {
    expect((await handleUpload(upload("t/c/photos/a.jpg"), env({ ACCESS_AUD: undefined }), access())).status).toBe(500);
  });

  it("handleUpload_badKey_is400", async () => {
    expect((await handleUpload(upload("../../etc/passwd"), env(), access())).status).toBe(400);
  });

  it("handleUpload_overTheSizeLimit_is413", async () => {
    expect((await handleUpload(upload("t/c/videos/a.mov", { size: MAX_UPLOAD_BYTES + 1 }), env(), access())).status).toBe(413);
  });

  it("handleUpload_bucketDown_is502", async () => {
    expect((await handleUpload(upload("t/c/photos/a.jpg"), env({ ORIGINALS: bucket(true) }), access())).status).toBe(502);
  });

  it("handleUpload_valid_storesUnderItsKey", async () => {
    const e = env();
    const res = await handleUpload(upload("t/c/photos/a.jpg"), e, access());
    expect([res.status, (e.ORIGINALS as ReturnType<typeof bucket>).keys]).toEqual([201, ["t/c/photos/a.jpg"]]);
  });

  it("handleUpload_wrongMethod_is405", async () => {
    expect((await handleUpload(new Request("https://johnojo.me/api/upload?key=t/c/photos/a.jpg", { method: "GET", headers: { "cf-access-jwt-assertion": goodToken } }), env(), access())).status).toBe(405);
  });
});

describe("handleProcess", () => {
  const post = (token = goodToken) => new Request("https://johnojo.me/api/process", { method: "POST", headers: { "cf-access-jwt-assertion": token } });

  it("handleProcess_noAccessToken_neverCallsGitHub", async () => {
    const gh = vi.fn();
    const res = await handleProcess(post(""), env(), access(), gh);
    expect([res.status, gh.mock.calls.length]).toEqual([403, 0]);
  });

  it("handleProcess_tokenMissing_is503", async () => {
    expect((await handleProcess(post(), env({ GITHUB_DISPATCH_TOKEN: undefined }), access(), vi.fn())).status).toBe(503);
  });

  it("handleProcess_githubUnreachable_is502", async () => {
    const res = await handleProcess(post(), env(), access(), (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch);
    expect(res.status).toBe(502);
  });

  it("handleProcess_githubRefuses_is502", async () => {
    expect((await handleProcess(post(), env(), access(), (async () => new Response("no", { status: 401 })) as unknown as typeof fetch)).status).toBe(502);
  });

  it("handleProcess_githubAccepts_is202", async () => {
    expect((await handleProcess(post(), env(), access(), (async () => new Response(null, { status: 204 })) as unknown as typeof fetch)).status).toBe(202);
  });
});

describe("handlePreview", () => {
  const get = (path: string, token = goodToken) => new Request(`https://johnojo.me${path}`, { headers: { "cf-access-jwt-assertion": token } });

  it("handlePreview_noAccessToken_isDenied", async () => {
    expect((await handlePreview(get("/api/preview/t/c/photos/a.jpg", ""), env(), access())).status).toBe(403);
  });

  it("handlePreview_pathOutsidePreviews_is400", async () => {
    expect((await handlePreview(get("/api/preview/../originals/t/c/photos/a.jpg"), env(), access())).status).toBe(400);
  });

  it("handlePreview_notUploadedYet_is404", async () => {
    expect((await handlePreview(get("/api/preview/t/c/photos/a.jpg"), env(), access())).status).toBe(404);
  });

  it("handlePreview_existing_servesTheJpegPrivately", async () => {
    const b = bucket();
    await b.put("_previews/t/c/photos/a.jpg");
    const res = await handlePreview(get("/api/preview/t/c/photos/a.jpg"), env({ ORIGINALS: b }), access());
    expect([res.status, res.headers.get("content-type"), res.headers.get("cache-control")]).toEqual([200, "image/jpeg", "private, max-age=300"]);
  });
});

describe("video previews", () => {
  const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://johnojo.me${path}`, { headers: { "cf-access-jwt-assertion": goodToken, ...headers } });

  it("parseRange_openAndClosedRanges_areParsed", () => {
    expect([parseRange("bytes=0-99"), parseRange("bytes=500-"), parseRange("items=1-2"), parseRange(null)]).toEqual([{ offset: 0, length: 100 }, { offset: 500 }, null, null]);
  });

  it("handlePreview_videoWithRange_answers206WithContentRange", async () => {
    const b = bucket();
    await b.put("_previews/t/c/videos/v.mp4");
    const res = await handlePreview(get("/api/preview/t/c/videos/v.mp4", { range: "bytes=0-99" }), env({ ORIGINALS: b }), access());
    expect([res.status, res.headers.get("content-range"), res.headers.get("content-type")]).toEqual([206, "bytes 0-99/1000", "video/mp4"]);
  });

  it("handlePreview_videoUnderPhotosFolder_isRejected", async () => {
    expect((await handlePreview(get("/api/preview/t/c/photos/v.mp4"), env(), access())).status).toBe(400);
  });
});

describe("upload safety and big files", () => {
  const req = (method: string, query: string, body?: string, headers: Record<string, string> = {}) =>
    new Request(`https://johnojo.me/api/upload?key=${encodeURIComponent("t/c/videos/IMG_1.MOV")}${query}`, {
      method,
      body,
      headers: { "cf-access-jwt-assertion": goodToken, ...(body ? { "content-length": String(body.length) } : {}), ...headers },
    });

  it("handleUpload_nameAlreadyTaken_is409AndKeepsTheOriginal", async () => {
    const b = bucket();
    await b.put("t/c/photos/a.jpg");
    const res = await handleUpload(upload("t/c/photos/a.jpg"), env({ ORIGINALS: b }), access());
    expect([res.status, b.keys.length]).toEqual([409, 1]);
  });

  it("handleUpload_multipartStartFinish_storesTheFile", async () => {
    const b = bucket();
    const e = env({ ORIGINALS: b });
    const start = await (await handleUpload(req("POST", "&action=start&size=300000000"), e, access())).json();
    const part = await (await handleUpload(req("PUT", `&uploadId=${start.uploadId}&part=1`, "abcd"), e, access())).json();
    const done = await handleUpload(req("POST", `&action=finish&uploadId=${start.uploadId}`, JSON.stringify([part]), { "content-type": "application/json" }), e, access());
    expect([done.status, b.stored.has("t/c/videos/IMG_1.MOV")]).toEqual([201, true]);
  });

  it("handleUpload_multipartStartWhenNameTaken_is409", async () => {
    const b = bucket();
    await b.put("t/c/videos/IMG_1.MOV");
    expect((await handleUpload(req("POST", "&action=start&size=300000000"), env({ ORIGINALS: b }), access())).status).toBe(409);
  });

  it("handleUpload_multipartOverFileLimit_is413", async () => {
    expect((await handleUpload(req("POST", "&action=start&size=6000000000"), env(), access())).status).toBe(413);
  });

  it("handleUpload_finishWithGarbageParts_is400", async () => {
    const b = bucket();
    const e = env({ ORIGINALS: b });
    const start = await (await handleUpload(req("POST", "&action=start&size=10"), e, access())).json();
    expect((await handleUpload(req("POST", `&action=finish&uploadId=${start.uploadId}`, '[{"partNumber":"x"}]'), e, access())).status).toBe(400);
  });

  it("handleUpload_unknownUploadId_is502NotACrash", async () => {
    expect((await handleUpload(req("PUT", "&uploadId=nope&part=1", "abcd"), env(), access())).status).toBe(502);
  });

  it("handleUpload_abort_cancelsTheUpload", async () => {
    const b = bucket();
    const e = env({ ORIGINALS: b });
    const start = await (await handleUpload(req("POST", "&action=start&size=10"), e, access())).json();
    const res = await handleUpload(req("DELETE", `&uploadId=${start.uploadId}`), e, access());
    expect([res.status, b.uploads.get(start.uploadId)?.aborted]).toEqual([200, true]);
  });
});

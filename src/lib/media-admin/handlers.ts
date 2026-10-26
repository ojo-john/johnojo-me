/**
 * Request handlers for the admin media tools (functions/api/upload, /api/process, /api/preview/*). Every
 * route sits behind the same Cloudflare Access login as /admin; the token Access adds is verified here
 * as well, first, and every failure denies. Free of Cloudflare imports so they're unit-tested with plain
 * Requests and in-memory fakes.
 */
import { verifyAccess, type AccessDeps } from "../metrics/access";
import { json, log } from "../metrics/cf";

/** One part of a multipart upload, as R2 reports it. */
export interface UploadedPart {
  partNumber: number;
  etag: string;
}
export interface MultipartUpload {
  uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer): Promise<UploadedPart>;
  complete(parts: UploadedPart[]): Promise<unknown>;
  abort(): Promise<void>;
}

/** The slice of an R2 bucket binding these routes use. */
export interface BucketBinding {
  put(key: string, value: ReadableStream | ArrayBuffer | null, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  head(key: string): Promise<unknown | null>;
  createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): MultipartUpload;
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>;
}

export interface MediaAdminEnv {
  /** Private bucket for originals and the editor's working copies. */
  ORIGINALS?: BucketBinding;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** "owner/repo" whose media workflow runs on "process-media". */
  GITHUB_REPO?: string;
  /** Fine-grained token for that repo only, with Actions/Contents write (a secret). */
  GITHUB_DISPATCH_TOKEN?: string;
}

/** Cloudflare's free plan caps request bodies at 100 MB, so bigger files arrive as parts of at most this. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Largest whole file accepted through multipart upload (a long 4K phone clip is well under this). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_PARTS = 10_000;
const GITHUB_TIMEOUT_MS = 10_000;
const PART = /^[A-Za-z0-9][A-Za-z0-9 ._+()-]{0,99}$/;
const EXT = { photos: /\.(jpe?g|png|heic|heif|webp|tiff?)$/i, videos: /\.(mp4|mov|m4v)$/i } as const;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

const requestId = (req: Request) => req.headers.get("cf-ray") ?? crypto.randomUUID();

/** "<trip>/<city>/<photos|videos>/<file>", nothing else: no traversal, no hidden folders, right file type. */
export function validOriginalKey(key: string | null): key is string {
  if (!key) return false;
  const parts = key.split("/");
  if (parts.length !== 4 || parts.some((p) => !PART.test(p) || p.startsWith("_") || p === "." || p === "..")) return false;
  const [, , kind, file] = parts;
  return (kind === "photos" || kind === "videos") && EXT[kind].test(file);
}

async function gate(req: Request, env: MediaAdminEnv, access: AccessDeps, route: string, id: string): Promise<Response | null> {
  const result = await verifyAccess(req.headers.get("cf-access-jwt-assertion"), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD, access);
  if (result.ok) return null;
  log(result.status === 403 ? "warn" : "error", { route, outcome: "denied", reason: result.reason, requestId: id });
  return json(result.status, { error: result.status === 403 ? "forbidden" : result.reason });
}

/**
 * /api/upload?key=<trip>/<city>/<photos|videos>/<file> stores one original in the private bucket. Never
 * overwrites: cameras reuse names (IMG_0001), so an existing key answers 409 and the page picks a new name.
 *   PUT                          whole file, up to MAX_UPLOAD_BYTES
 *   POST   &action=start         begin a multipart upload (files bigger than one request allows)
 *   PUT    &uploadId=…&part=N    one part
 *   POST   &action=finish&uploadId=…   body: [{ partNumber, etag }]
 *   DELETE &uploadId=…           abandon it
 */
export async function handleUpload(req: Request, env: MediaAdminEnv, access: AccessDeps): Promise<Response> {
  const id = requestId(req);
  if (!["PUT", "POST", "DELETE"].includes(req.method)) return json(405, { error: "method-not-allowed" }, { Allow: "PUT, POST, DELETE" });
  const denied = await gate(req, env, access, "upload", id);
  if (denied) return denied;
  if (!env.ORIGINALS) return json(503, { error: "not-configured" });
  const q = new URL(req.url).searchParams;
  const key = q.get("key");
  if (!validOriginalKey(key)) return json(400, { error: "invalid-key" });
  const bucket = env.ORIGINALS;
  const uploadId = q.get("uploadId");
  const contentType = req.headers.get("content-type") ?? "application/octet-stream";
  const started = Date.now();
  const failed = (e: unknown, step: string) => {
    log("error", { route: "upload", outcome: "store-failed", step, error: e instanceof Error ? e.name : "unknown", requestId: id });
    return json(502, { error: "store-failed" });
  };
  const bodySize = () => {
    const n = Number(req.headers.get("content-length") ?? NaN);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // Abandon a multipart upload.
  if (req.method === "DELETE") {
    if (!uploadId) return json(400, { error: "upload-id-required" });
    try {
      await bucket.resumeMultipartUpload(key, uploadId).abort();
    } catch (e) {
      return failed(e, "abort");
    }
    return json(200, { aborted: true });
  }

  if (req.method === "POST") {
    const action = q.get("action");
    if (action === "start") {
      const size = Number(q.get("size") ?? NaN);
      if (!Number.isFinite(size) || size <= 0) return json(400, { error: "size-required" });
      if (size > MAX_FILE_BYTES) return json(413, { error: "too-large", maxBytes: MAX_FILE_BYTES });
      if (await bucket.head(key)) return json(409, { error: "exists" });
      try {
        const up = await bucket.createMultipartUpload(key, { httpMetadata: { contentType } });
        return json(200, { uploadId: up.uploadId });
      } catch (e) {
        return failed(e, "start");
      }
    }
    if (action === "finish") {
      if (!uploadId) return json(400, { error: "upload-id-required" });
      let parts: UploadedPart[];
      try {
        parts = (await req.json()) as UploadedPart[];
      } catch {
        return json(400, { error: "invalid-parts" });
      }
      if (!Array.isArray(parts) || !parts.length || parts.length > MAX_PARTS || !parts.every((p) => Number.isInteger(p?.partNumber) && typeof p?.etag === "string")) return json(400, { error: "invalid-parts" });
      try {
        await bucket.resumeMultipartUpload(key, uploadId).complete(parts);
      } catch (e) {
        return failed(e, "finish");
      }
      log("info", { route: "upload", outcome: "ok", parts: parts.length, latencyMs: Date.now() - started, requestId: id });
      return json(201, { key });
    }
    return json(400, { error: "unknown-action" });
  }

  // PUT: a whole file, or one part of a multipart upload.
  const size = bodySize();
  if (size === null) return json(411, { error: "length-required" });
  if (size > MAX_UPLOAD_BYTES) return json(413, { error: "too-large", maxBytes: MAX_UPLOAD_BYTES });
  if (uploadId) {
    const part = Number(q.get("part"));
    if (!Number.isInteger(part) || part < 1 || part > MAX_PARTS) return json(400, { error: "invalid-part" });
    try {
      return json(200, await bucket.resumeMultipartUpload(key, uploadId).uploadPart(part, req.body as ReadableStream));
    } catch (e) {
      return failed(e, "part");
    }
  }
  if (await bucket.head(key)) return json(409, { error: "exists" });
  try {
    await bucket.put(key, req.body, { httpMetadata: { contentType } });
  } catch (e) {
    return failed(e, "put");
  }
  log("info", { route: "upload", outcome: "ok", bytes: size, latencyMs: Date.now() - started, requestId: id });
  return json(201, { key });
}

/** POST /api/process: asks GitHub to run the media job (process new photos, publish, rebuild). */
export async function handleProcess(req: Request, env: MediaAdminEnv, access: AccessDeps, doFetch: typeof fetch): Promise<Response> {
  const id = requestId(req);
  if (req.method !== "POST") return json(405, { error: "method-not-allowed" }, { Allow: "POST" });
  const denied = await gate(req, env, access, "process", id);
  if (denied) return denied;
  if (!env.GITHUB_REPO || !REPO.test(env.GITHUB_REPO) || !env.GITHUB_DISPATCH_TOKEN) return json(503, { error: "not-configured" });
  let res: Response;
  try {
    res = await doFetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "johnojo-me-admin", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ event_type: "process-media" }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
  } catch (e) {
    log("error", { route: "process", outcome: "github-unreachable", error: e instanceof Error ? e.name : "unknown", requestId: id });
    return json(502, { error: "github-unreachable" });
  }
  if (res.status !== 204) {
    log("error", { route: "process", outcome: "github-refused", status: res.status, requestId: id });
    return json(502, { error: "github-refused", status: res.status });
  }
  log("info", { route: "process", outcome: "ok", requestId: id });
  return json(202, { started: true });
}

/** "bytes=100-199" / "bytes=100-" → offset and length, or null for anything else (then the whole file is sent). */
export function parseRange(header: string | null): { offset: number; length?: number } | null {
  const m = header?.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return null;
  const offset = Number(m[1]);
  return m[2] ? { offset, length: Number(m[2]) - offset + 1 } : { offset };
}

/**
 * GET /api/preview/<media id>.jpg|.mp4: the editor's untouched working copy (uncropped photo, untrimmed
 * clip), from the private bucket. Clips honour Range requests, which Safari needs to play and seek.
 */
export async function handlePreview(req: Request, env: MediaAdminEnv, access: AccessDeps): Promise<Response> {
  const id = requestId(req);
  if (req.method !== "GET") return json(405, { error: "method-not-allowed" }, { Allow: "GET" });
  const denied = await gate(req, env, access, "preview", id);
  if (denied) return denied;
  if (!env.ORIGINALS) return json(503, { error: "not-configured" });
  const m = new URL(req.url).pathname.match(/^\/api\/preview\/([a-z0-9-]+\/[a-z0-9-]+\/(?:photos\/[a-z0-9-]+\.jpg|videos\/[a-z0-9-]+\.mp4))$/);
  if (!m) return json(400, { error: "invalid-path" });
  const video = m[1].endsWith(".mp4");
  const range = video ? parseRange(req.headers.get("range")) : null;
  const obj = await env.ORIGINALS.get(`_previews/${m[1]}`, range ? { range } : undefined);
  if (!obj) return json(404, { error: "not-found" });
  const headers: Record<string, string> = { "Content-Type": video ? "video/mp4" : "image/jpeg", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex", "Accept-Ranges": "bytes" };
  if (!range) return new Response(obj.body, { headers: { ...headers, "Content-Length": String(obj.size) } });
  const end = Math.min(obj.size - 1, range.length ? range.offset + range.length - 1 : obj.size - 1);
  return new Response(obj.body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${range.offset}-${end}/${obj.size}`, "Content-Length": String(end - range.offset + 1) } });
}

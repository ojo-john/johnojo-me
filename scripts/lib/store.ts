/**
 * Object storage behind the media commands. The commands talk to this interface, so tests use an
 * in-memory store and production uses Cloudflare R2 (S3-compatible). Two buckets:
 *   R2_BUCKET            public: the web copies served at https://media.johnojo.me
 *   R2_ORIGINALS_BUCKET  private: original photos and clips, plus the editor's working copies (_previews/)
 * Credentials come from .env.local locally and from repository secrets in the cloud job; never from code.
 * On a laptop with no R2 keys, the commands use your Cloudflare sign-in instead (npx wrangler login),
 * through Cloudflare's REST API: no key to create or keep.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface StoredObject {
  key: string;
  size: number;
  /** MD5 of the content for single-part uploads (every upload these commands make), without quotes. */
  etag: string;
}

export interface ObjectStore {
  /** Every object under the prefix (all pages). */
  list(prefix?: string): Promise<StoredObject[]>;
  put(key: string, body: Buffer, contentType: string, cacheControl?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Per request: uploads of large clips need time, but a hung connection must not stall the job forever. */
const REQUEST_TIMEOUT_MS = 120_000;
/** The SDK retries throttling, timeouts and 5xx with exponential backoff and jitter. */
const MAX_ATTEMPTS = 4;

export class MissingStorageSettings extends Error {}

/** Reads KEY=value lines from .env.local into process.env (never overriding what's already set). */
export function loadEnvFile(file = ".env.local") {
  for (const line of fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : []) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function client(): S3Client {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new MissingStorageSettings("Missing R2 settings: add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to .env.local (or the job's secrets).");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS },
    maxAttempts: MAX_ATTEMPTS,
  });
}

export function r2Store(bucketVar: "R2_BUCKET" | "R2_ORIGINALS_BUCKET"): ObjectStore {
  const bucket = process.env[bucketVar];
  if (!bucket) throw new MissingStorageSettings(`Missing ${bucketVar} in .env.local (or the job's secrets).`);
  if (!process.env.R2_ACCESS_KEY_ID && !process.env.R2_SECRET_ACCESS_KEY) return signedInStore(bucket);
  const s3 = client();
  return {
    async list(prefix = "") {
      const out: StoredObject[] = [];
      let token: string | undefined;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of page.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, etag: (o.ETag ?? "").replace(/"/g, "") });
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
    async put(key, body, contentType, cacheControl) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }));
    },
    async get(key) {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await (res.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/** Pinned so the sign-in path doesn't change under us; matches the version used to log in. */
const WRANGLER = "wrangler@4.153.0";
/** Cloudflare's REST API takes uploads up to 300 MB; anything bigger needs R2 keys (S3 multipart). */
const API_MAX_BYTES = 300 * 1000 ** 2;
const LIST_PAGE = 1000;

export class StorageRequestFailed extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** The signed-in Cloudflare session's current token (wrangler refreshes it when it has expired). */
function signedInToken(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  let out: string;
  try {
    out = execFileSync("npx", ["--yes", WRANGLER, "auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  } catch {
    throw new MissingStorageSettings("No R2 keys in .env.local and no Cloudflare sign-in: run `npx wrangler login` first.");
  }
  const token = out.trim().split("\n").at(-1)?.trim();
  if (!token || /\s/.test(token)) throw new MissingStorageSettings("Couldn't read the Cloudflare sign-in: run `npx wrangler login` again.");
  return token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function signedInStore(bucket: string): ObjectStore {
  const account = process.env.R2_ACCOUNT_ID;
  if (!account) throw new MissingStorageSettings("Missing R2_ACCOUNT_ID in .env.local.");
  return apiStore({ account, bucket, getToken: signedInToken, canRenew: !process.env.CLOUDFLARE_API_TOKEN, fetch, backoffMs: 500 });
}

export interface ApiStoreDeps {
  account: string;
  bucket: string;
  getToken: () => string;
  /** False for a fixed CLOUDFLARE_API_TOKEN, which a retry can't renew. */
  canRenew: boolean;
  fetch: typeof fetch;
  /** First backoff step; doubles per attempt, with full jitter. */
  backoffMs: number;
}

/** R2 through Cloudflare's REST API. Same timeout and retry budget as the S3 client. */
export function apiStore({ account, bucket, getToken, canRenew, fetch, backoffMs }: ApiStoreDeps): ObjectStore {
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${encodeURIComponent(bucket)}/objects`;
  let token: string | null = null;
  const objectUrl = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    token ??= getToken();
    for (let attempt = 1; ; attempt++) {
      let res: Response | null = null;
      let failure: StorageRequestFailed;
      try {
        res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (res.ok) return res;
        // Sign-ins last about an hour; a long sync renews it once rather than failing everything after.
        if (res.status === 401 && attempt === 1 && canRenew) {
          token = getToken();
          continue;
        }
        // Throttling and server errors are worth another try; anything else (denied, not found, bad request) isn't.
        const retryable = res.status === 429 || res.status >= 500;
        failure = new StorageRequestFailed(`R2 API ${init.method ?? "GET"} answered ${res.status}`, retryable);
      } catch (err) {
        // Timeouts and dropped connections.
        failure = new StorageRequestFailed(`R2 API ${init.method ?? "GET"} failed: ${(err as Error).name}`, true);
      }
      if (!failure.retryable || attempt >= MAX_ATTEMPTS) throw failure;
      // Exponential backoff with full jitter: up to 0.5 s, 1 s, 2 s.
      await sleep(Math.random() * backoffMs * 2 ** (attempt - 1));
    }
  }

  return {
    async list(prefix = "") {
      const out: StoredObject[] = [];
      let cursor: string | undefined;
      do {
        const q = new URLSearchParams({ per_page: String(LIST_PAGE), ...(prefix ? { prefix } : {}), ...(cursor ? { cursor } : {}) });
        const body = (await (await call(`${base}?${q}`)).json()) as { result: { key: string; size: number; etag: string }[]; result_info?: { cursor?: string; is_truncated?: boolean } };
        for (const o of body.result) out.push({ key: o.key, size: Number(o.size), etag: o.etag.replace(/"/g, "") });
        cursor = body.result_info?.is_truncated ? body.result_info.cursor : undefined;
      } while (cursor);
      return out;
    },
    async put(key, body, contentType, cacheControl) {
      if (body.length > API_MAX_BYTES) throw new StorageRequestFailed(`${key} is over 300 MB: upload it with R2 keys or trim it`, false);
      await call(objectUrl(key), { method: "PUT", body: new Uint8Array(body), headers: { "Content-Type": contentType, ...(cacheControl ? { "Cache-Control": cacheControl } : {}) } });
    },
    async get(key) {
      return Buffer.from(await (await call(objectUrl(key))).arrayBuffer());
    },
    async delete(key) {
      await call(objectUrl(key), { method: "DELETE" });
    },
  };
}

/** For tests: a store kept in memory, with MD5 ETags like R2's. */
export function memoryStore(initial: Record<string, Buffer> = {}): ObjectStore & { data: Map<string, Buffer> } {
  const data = new Map(Object.entries(initial));
  const etag = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");
  return {
    data,
    async list(prefix = "") {
      return [...data].filter(([k]) => k.startsWith(prefix)).map(([key, b]) => ({ key, size: b.length, etag: etag(b) }));
    },
    async put(key, body) {
      data.set(key, body);
    },
    async get(key) {
      const b = data.get(key);
      if (!b) throw new Error(`NoSuchKey: ${key}`);
      return b;
    },
    async delete(key) {
      data.delete(key);
    },
  };
}

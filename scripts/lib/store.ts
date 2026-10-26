/**
 * Object storage behind the media commands. The commands talk to this interface, so tests use an
 * in-memory store and production uses Cloudflare R2 (S3-compatible). Two buckets:
 *   R2_BUCKET            public: the web copies served at https://media.johnojo.me
 *   R2_ORIGINALS_BUCKET  private: original photos and clips, plus the editor's working copies (_previews/)
 * Credentials come from .env.local locally and from repository secrets in the cloud job; never from code.
 */
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

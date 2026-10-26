/**
 * npm run media:upload  (add --dry-run to list what would change without touching the bucket)
 *
 * Uploads to the Cloudflare R2 bucket behind https://media.johnojo.me ONLY the files the public site shows:
 * visible photos and clips from published trips. Hidden photos, duplicates and drafts stay off public
 * storage, and anything uploaded before that is now hidden is deleted from the bucket. Only new or
 * changed files are sent; a local record of what's in the bucket lives in .cache/uploaded.json.
 *
 * Needs, in .env.local (never committed):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * Create the key in the Cloudflare dashboard: R2 → Manage API tokens → Object Read & Write, this bucket only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = path.join(process.cwd(), "public");
const CACHE = path.join(process.cwd(), ".cache", "uploaded.json");
const TYPES: Record<string, string> = { ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg", ".mp4": "video/mp4" };

async function main() {
  // Read content exactly as the live build does: no drafts, and local /media paths (not the R2 domain).
  Object.assign(process.env, { NODE_ENV: "production", SHOW_DRAFTS: "", MEDIA_BASE_URL: "" });
  const { getTrips } = await import("../src/lib/content/load");
  const { publicMediaKeys } = await import("../src/lib/content/public-media");
  const wanted = publicMediaKeys(getTrips());

  const missing = [...wanted].filter((k) => !fs.existsSync(path.join(ROOT, k)));
  if (missing.length) {
    console.error(`${missing.length} file(s) the site shows aren't in public/media (run npm run media first), e.g. ${missing[0]}`);
    process.exit(1);
  }

  const done: Record<string, string> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const toSend = [...wanted].sort().flatMap((key) => {
    const body = fs.readFileSync(path.join(ROOT, key));
    const hash = crypto.createHash("sha1").update(body).digest("hex");
    return done[key] === hash ? [] : [{ key, body, hash }];
  });
  const toRemove = Object.keys(done).filter((key) => !wanted.has(key)).sort();
  console.log(`${wanted.size} public files: ${toSend.length} to upload, ${toRemove.length} to remove (hidden or no longer used), ${wanted.size - toSend.length} unchanged.`);
  if (DRY_RUN) {
    toRemove.forEach((k) => console.log(`  - ${k}`));
    process.exit(0);
  }

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error("Missing R2 settings. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET to .env.local.");
    process.exit(1);
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestHandler: { requestTimeout: 120_000 },
    maxAttempts: 4, // SDK retries with exponential backoff
  });
  const save = () => {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(done));
  };

  let sent = 0, removed = 0, failed = 0;
  for (const { key, body, hash } of toSend) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: TYPES[path.extname(key)], CacheControl: "public, max-age=604800" }));
      done[key] = hash;
      if (++sent % 50 === 0) save();
    } catch (err) {
      // Keep going: one failed upload shouldn't stop the batch. Re-running retries only what's missing.
      failed++;
      console.error(`  ✗ upload ${key}: ${(err as Error).name}: ${(err as Error).message}`);
    }
  }
  for (const key of toRemove) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      delete done[key];
      removed++;
    } catch (err) {
      // Left in the record, so the next run tries the removal again.
      failed++;
      console.error(`  ✗ remove ${key}: ${(err as Error).name}: ${(err as Error).message}`);
    }
  }
  save();
  console.log(`${sent} uploaded, ${removed} removed, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

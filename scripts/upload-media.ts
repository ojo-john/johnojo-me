/**
 * npm run media:upload
 *
 * Uploads processed media (public/media) to the Cloudflare R2 bucket that serves https://media.johnojo.me.
 * Only new or changed files are sent; a local record of what's been uploaded lives in .cache/uploaded.json.
 *
 * Needs, in .env.local (never committed):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * Create the key in the Cloudflare dashboard: R2 → Manage API tokens → Object Read & Write, this bucket only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error("Missing R2 settings. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET to .env.local.");
  process.exit(1);
}

const ROOT = path.join(process.cwd(), "public");
const CACHE = path.join(process.cwd(), ".cache", "uploaded.json");
const TYPES: Record<string, string> = { ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg", ".mp4": "video/mp4" };

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  requestHandler: { requestTimeout: 120_000 },
  maxAttempts: 4, // SDK retries with exponential backoff
});

const files: string[] = [];
const walk = (d: string) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (TYPES[path.extname(f)]) files.push(p);
  }
};
walk(path.join(ROOT, "media"));

const done: Record<string, string> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
let sent = 0, skipped = 0, failed = 0;
for (const file of files) {
  const key = path.relative(ROOT, file).split(path.sep).join("/"); // media/<trip>/<city>/...
  const body = fs.readFileSync(file);
  const hash = crypto.createHash("sha1").update(body).digest("hex");
  if (done[key] === hash) {
    skipped++;
    continue;
  }
  try {
    await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: TYPES[path.extname(file)], CacheControl: "public, max-age=604800" }));
    done[key] = hash;
    sent++;
    if (sent % 50 === 0) fs.writeFileSync(CACHE, JSON.stringify(done));
  } catch (err) {
    // Keep going: one failed upload shouldn't stop the batch. Re-running retries only what's missing.
    failed++;
    console.error(`  ✗ ${key}: ${(err as Error).name}: ${(err as Error).message}`);
  }
}
fs.mkdirSync(path.dirname(CACHE), { recursive: true });
fs.writeFileSync(CACHE, JSON.stringify(done));
console.log(`${sent} uploaded, ${skipped} unchanged, ${failed} failed.`);
if (failed) process.exitCode = 1;

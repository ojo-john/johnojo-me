/**
 * npm run media:upload  (add --dry-run to see the plan without changing the bucket)
 *
 * Makes the public bucket (https://media.johnojo.me) hold exactly what the site shows: visible photos and
 * clips from published trips. New or changed files are uploaded; anything else under media/ (hidden
 * since, duplicates, drafts, removed) is deleted. Works on a machine that only has some of the files
 * (the cloud job): a file already in the bucket doesn't need to be local.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile, r2Store } from "./lib/store";
import { planPublish } from "./lib/sync-plan";

const ROOT = path.join(process.cwd(), "public");
const TYPES: Record<string, string> = { ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg", ".mp4": "video/mp4" };
/** Web copies never change under the same name without the manifest changing too, so browsers can keep them a week. */
const CACHE_CONTROL = "public, max-age=604800";

async function main() {
  loadEnvFile();
  const dryRun = process.argv.includes("--dry-run");
  // Read content exactly as the live build does: no drafts, and local /media paths (not the R2 domain).
  Object.assign(process.env, { NODE_ENV: "production", SHOW_DRAFTS: "", MEDIA_BASE_URL: "" });
  const { getTrips } = await import("../src/lib/content/load");
  const { publicMediaKeys } = await import("../src/lib/content/public-media");

  const md5 = (file: string) => crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
  const wanted = new Map([...publicMediaKeys(getTrips())].map((key) => {
    const file = path.join(ROOT, key);
    return [key, fs.existsSync(file) ? md5(file) : null] as const;
  }));
  const store = r2Store("R2_BUCKET");
  const plan = planPublish(wanted, await store.list("media/"));
  console.log(`${wanted.size} public files: ${plan.upload.length} to upload, ${plan.remove.length} to remove, ${plan.unchanged} unchanged.`);
  if (plan.missing.length) {
    // Publishing now would leave holes on the site; stop before changing anything.
    console.error(`${plan.missing.length} file(s) the site shows are neither in the bucket nor here (run npm run media first), e.g. ${plan.missing[0]}`);
    process.exit(1);
  }
  if (dryRun) {
    plan.remove.forEach((k) => console.log(`  - ${k}`));
    return;
  }

  let failed = 0;
  for (const key of plan.upload) {
    try {
      await store.put(key, fs.readFileSync(path.join(ROOT, key)), TYPES[path.extname(key)] ?? "application/octet-stream", CACHE_CONTROL);
    } catch (err) {
      // One failed file shouldn't stop the batch; re-running retries only what's still different.
      failed++;
      console.error(`  ✗ upload ${key}: ${(err as Error).name}: ${(err as Error).message}`);
    }
  }
  for (const key of plan.remove) {
    try {
      await store.delete(key);
    } catch (err) {
      failed++;
      console.error(`  ✗ remove ${key}: ${(err as Error).name}: ${(err as Error).message}`);
    }
  }
  console.log(`${plan.upload.length - failed} uploaded/removed ok, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

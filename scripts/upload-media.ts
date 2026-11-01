/**
 * npm run media:upload  (add --dry-run to see the plan without changing the bucket)
 *
 * Makes the public bucket (https://media.johnojo.me) hold exactly what the site shows: visible photos and
 * clips from published trips, including ones scheduled to appear later. New or changed files are uploaded;
 * anything else under media/ (hidden since, duplicates, drafts, removed) is deleted. Works on a machine that only has some of the files
 * (the cloud job): a file already in the bucket doesn't need to be local.
 *
 * Drafts' web copies go to the private bucket under _drafts/media/ instead, for the admin preview
 * (/admin/draft-media/, behind the admin login), and are removed from there once published or deleted.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { accountBytes, assertWithinBudget } from "./lib/budget-guard";
import { loadEnvFile, r2Store, type ObjectStore } from "./lib/store";
import { planPublish, type PublishPlan } from "./lib/sync-plan";
import { DRAFT_MEDIA_PREFIX, wantedMedia } from "./lib/wanted-media";

const ROOT = path.join(process.cwd(), "public");
const TYPES: Record<string, string> = { ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg", ".mp4": "video/mp4" };
/** Web copies never change under the same name without the manifest changing too, so browsers can keep them a week. */
const CACHE_CONTROL = "public, max-age=604800";

async function main() {
  loadEnvFile();
  const dryRun = process.argv.includes("--dry-run");
  const { publicKeys, draftKeys } = await wantedMedia();
  const md5 = (file: string) => crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
  const local = (key: string) => (fs.existsSync(path.join(ROOT, key)) ? md5(path.join(ROOT, key)) : null);
  const wanted = new Map([...publicKeys].map((key) => [key, local(key)] as const));
  // Bucket key → local key ("_drafts/media/x" is served from public/media/x).
  const draftWanted = new Map([...draftKeys].map((key) => [DRAFT_MEDIA_PREFIX + key, local(key)] as const));

  const store = r2Store("R2_BUCKET");
  const originals = r2Store("R2_ORIGINALS_BUCKET");
  const existing = await store.list("media/");
  const draftExisting = await originals.list(`${DRAFT_MEDIA_PREFIX}media/`);
  const plan = planPublish(wanted, existing);
  const draftPlan = planPublish(draftWanted, draftExisting, `${DRAFT_MEDIA_PREFIX}media/`);
  console.log(`${wanted.size} public files: ${plan.upload.length} to upload, ${plan.remove.length} to remove, ${plan.unchanged} unchanged.`);
  console.log(`${draftWanted.size} draft files (private): ${draftPlan.upload.length} to upload, ${draftPlan.remove.length} to remove, ${draftPlan.unchanged} unchanged.`);
  if (plan.missing.length) {
    // Publishing now would leave holes on the site; stop before changing anything.
    console.error(`${plan.missing.length} file(s) the site shows are neither in the bucket nor here (run npm run media first), e.g. ${plan.missing[0]}`);
    process.exit(1);
  }
  // A draft's missing photo only leaves a gap in the admin preview, so it doesn't stop the publish.
  if (draftPlan.missing.length) console.warn(`${draftPlan.missing.length} draft file(s) aren't here yet, so the preview will miss them, e.g. ${draftPlan.missing[0]}`);
  // Free-tier guardrail: measured across both buckets, checked before anything changes (a dry run too).
  const localPath = (key: string) => path.join(ROOT, key.startsWith(DRAFT_MEDIA_PREFIX) ? key.slice(DRAFT_MEDIA_PREFIX.length) : key);
  assertWithinBudget(
    await accountBytes([store, originals]),
    [...existing, ...draftExisting],
    new Map([...plan.upload, ...draftPlan.upload].map((key) => [key, fs.statSync(localPath(key)).size])),
    [...plan.remove, ...draftPlan.remove],
  );
  if (dryRun) {
    [...plan.remove, ...draftPlan.remove].forEach((k) => console.log(`  - ${k}`));
    return;
  }

  const failed = (await sync(store, plan, localPath)) + (await sync(originals, draftPlan, localPath));
  console.log(`${plan.upload.length + plan.remove.length + draftPlan.upload.length + draftPlan.remove.length - failed} uploaded/removed ok, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

/** Applies one bucket's plan; returns how many files failed. */
async function sync(store: ObjectStore, plan: PublishPlan, localPath: (key: string) => string): Promise<number> {
  let failed = 0;
  for (const key of plan.upload) {
    try {
      await store.put(key, fs.readFileSync(localPath(key)), TYPES[path.extname(key)] ?? "application/octet-stream", CACHE_CONTROL);
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
  return failed;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * npm run media:backup  (--dry-run to preview; --previews-only for the cloud job)
 *
 * Copies original photos and clips from the media folder to the private originals bucket, plus the
 * editor's uncropped working copies (public/_edit → _previews/), which the admin photo tool loads through
 * the login-protected /api/preview. Only new or changed files are sent, and nothing in the bucket is ever
 * deleted: once backed up, the local copies can be cleared.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PHOTO_EXT, VIDEO_EXT } from "./lib/ids";
import { accountBytes, assertWithinBudget } from "./lib/budget-guard";
import { loadEnvFile, r2Store } from "./lib/store";
import { planBackup } from "./lib/sync-plan";

const SOURCE = process.env.MEDIA_SOURCE ?? path.join(os.homedir(), "workspace", "johnojo-media");
const PREVIEWS = path.join(process.cwd(), "public", "_edit");
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".heic": "image/heic", ".heif": "image/heif", ".webp": "image/webp", ".tif": "image/tiff", ".tiff": "image/tiff", ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v" };

const md5 = (file: string) => crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
const dirs = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d).filter((n) => !n.startsWith("_") && !n.startsWith(".") && fs.statSync(path.join(d, n)).isDirectory()) : []);

/** bucket key → local file, for every original in <trip>/<city>/<photos|videos>/. */
function localOriginals(): Map<string, string> {
  const out = new Map<string, string>();
  for (const trip of dirs(SOURCE))
    for (const city of dirs(path.join(SOURCE, trip)))
      for (const kind of ["photos", "videos"] as const) {
        const d = path.join(SOURCE, trip, city, kind);
        if (!fs.existsSync(d)) continue;
        for (const name of fs.readdirSync(d)) {
          if ((kind === "photos" ? PHOTO_EXT : VIDEO_EXT).has(path.extname(name).toLowerCase())) out.set(`${trip}/${city}/${kind}/${name}`, path.join(d, name));
        }
      }
  return out;
}

function localPreviews(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".jpg") || n.endsWith(".mp4")) out.set(`_previews/${path.relative(PREVIEWS, p).split(path.sep).join("/")}`, p);
    }
  };
  walk(PREVIEWS);
  return out;
}

async function main() {
  loadEnvFile();
  const dryRun = process.argv.includes("--dry-run");
  const files = new Map([...(process.argv.includes("--previews-only") ? [] : localOriginals()), ...localPreviews()]);
  const local = new Map([...files].map(([key, file]) => [key, { size: fs.statSync(file).size, md5: md5(file) }]));
  const store = r2Store("R2_ORIGINALS_BUCKET");
  const existing = await store.list();
  const send = planBackup(local, existing);
  console.log(`${local.size} local files: ${send.length} to back up, ${local.size - send.length} already safe.`);
  // Free-tier guardrail: measured across both buckets, checked before anything is sent (a dry run too).
  assertWithinBudget(await accountBytes([store, r2Store("R2_BUCKET")]), existing, new Map(send.map((key) => [key, local.get(key)?.size ?? 0])), []);
  if (dryRun) return;
  let failed = 0;
  for (const key of send) {
    try {
      await store.put(key, fs.readFileSync(files.get(key) as string), TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream");
    } catch (err) {
      failed++;
      console.error(`  ✗ ${key}: ${(err as Error).name}: ${(err as Error).message}`);
    }
  }
  console.log(`${send.length - failed} backed up, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

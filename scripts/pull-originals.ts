/**
 * npm run media:pull  (used by the cloud job)
 *
 * Downloads, from the private originals bucket into MEDIA_SOURCE, only the originals the site doesn't
 * have yet, whose rotate/crop changed since they were processed, or whose web copies are missing from
 * storage (so they're made again). `npm run media` (with MEDIA_KEEP_UNSEEN=1) then processes just those.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEdits } from "./lib/edits";
import { loadEnvFile, r2Store } from "./lib/store";
import { idsMissingWebCopies, planDeletes, planPull, webCopyOwners } from "./lib/sync-plan";
import { DRAFT_MEDIA_PREFIX, wantedMedia } from "./lib/wanted-media";

async function main() {
  loadEnvFile();
  const target = process.env.MEDIA_SOURCE;
  if (!target) throw new Error("Set MEDIA_SOURCE to the folder to download originals into.");
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "media-manifest.json"), "utf8")) as { items: Parameters<typeof webCopyOwners>[0] & Record<string, { source?: string }> };
  const sources = Object.fromEntries(Object.entries(manifest.items).map(([id, e]) => [id, e.source]));
  const store = r2Store("R2_ORIGINALS_BUCKET");
  const edits = loadEdits(path.join(process.cwd(), "content", "visits"));
  const originals = await store.list();
  // Web copies the site wants but storage doesn't have: make them again from the originals.
  const { publicKeys, draftKeys } = await wantedMedia();
  const stored = new Set([
    ...(await r2Store("R2_BUCKET").list("media/")).map((o) => o.key),
    ...originals.filter((o) => o.key.startsWith(DRAFT_MEDIA_PREFIX)).map((o) => o.key.slice(DRAFT_MEDIA_PREFIX.length)),
  ]);
  const rebuild = idsMissingWebCopies([...publicKeys, ...draftKeys], stored, webCopyOwners(manifest.items));
  const keys = planPull(originals, sources, edits, rebuild);
  const deletes = planDeletes(originals, edits);
  console.log(`${keys.length} original(s) to process (${rebuild.size} to remake: web copies missing), ${deletes.length} deleted in the editor.`);
  let failed = 0;
  // Deleted in the editor: keep a copy under _deleted/ (recoverable), then remove the original.
  for (const key of deletes) {
    try {
      await store.put(`_deleted/${key}`, await store.get(key), "application/octet-stream");
      await store.delete(key);
    } catch (err) {
      failed++;
      console.error(`  ✗ delete ${key}: ${(err as Error).name}: ${(err as Error).message}`);
    }
  }
  for (const key of keys) {
    try {
      const file = path.join(target, ...key.split("/"));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, await store.get(key));
    } catch (err) {
      // Skipped this run; still unprocessed, so the next run picks it up again.
      failed++;
      console.error(`  ✗ ${key}: ${(err as Error).name}: ${(err as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * npm run media:pull  (used by the cloud job)
 *
 * Downloads, from the private originals bucket into MEDIA_SOURCE, only the originals the site doesn't
 * have yet or whose rotate/crop changed since they were processed. `npm run media` (with
 * MEDIA_KEEP_UNSEEN=1) then processes just those.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEdits } from "./lib/edits";
import { loadEnvFile, r2Store } from "./lib/store";
import { planDeletes, planPull } from "./lib/sync-plan";

async function main() {
  loadEnvFile();
  const target = process.env.MEDIA_SOURCE;
  if (!target) throw new Error("Set MEDIA_SOURCE to the folder to download originals into.");
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "media-manifest.json"), "utf8")) as { items: Record<string, { source?: string }> };
  const sources = Object.fromEntries(Object.entries(manifest.items).map(([id, e]) => [id, e.source]));
  const store = r2Store("R2_ORIGINALS_BUCKET");
  const edits = loadEdits(path.join(process.cwd(), "content", "visits"));
  const originals = await store.list();
  const keys = planPull(originals, sources, edits);
  const deletes = planDeletes(originals, edits);
  console.log(`${keys.length} original(s) to process, ${deletes.length} deleted in the editor.`);
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

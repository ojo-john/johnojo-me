/**
 * npm run media:usage: how much of R2's free storage the site uses, per bucket, against the budget the
 * upload paths enforce (src/lib/media-admin/budget.ts).
 */
import { formatGB, R2_FREE_STORAGE_BYTES, STORAGE_BUDGET_BYTES } from "../src/lib/media-admin/budget";
import { loadEnvFile, r2Store } from "./lib/store";

async function main() {
  loadEnvFile();
  const buckets = [
    { name: "public (web copies)", store: r2Store("R2_BUCKET") },
    { name: "private (originals)", store: r2Store("R2_ORIGINALS_BUCKET") },
  ];
  let total = 0;
  for (const b of buckets) {
    const objects = await b.store.list();
    const bytes = objects.reduce((sum, o) => sum + o.size, 0);
    total += bytes;
    console.log(`${b.name.padEnd(22)} ${formatGB(bytes).padStart(9)}  ${objects.length} files`);
  }
  console.log(`${"total".padEnd(22)} ${formatGB(total).padStart(9)}  ${Math.round((total / R2_FREE_STORAGE_BYTES) * 100)}% of the free ${formatGB(R2_FREE_STORAGE_BYTES)}`);
  console.log(`Uploads stop at ${formatGB(STORAGE_BUDGET_BYTES)}; ${formatGB(Math.max(0, STORAGE_BUDGET_BYTES - total))} left.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

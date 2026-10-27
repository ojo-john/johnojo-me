/**
 * The storage budget (src/lib/media-admin/budget.ts) for the media commands: measures both buckets,
 * and stops a sync before it changes anything if the result would pass the free-tier budget.
 */
import { checkStorageBudget, formatGB, syncChangeBytes } from "../../src/lib/media-admin/budget";
import type { ObjectStore, StoredObject } from "./store";

export class OverStorageBudget extends Error {}

/** Bytes stored across both buckets: the free tier counts the account, not one bucket. */
export async function accountBytes(stores: ObjectStore[]): Promise<number> {
  const listings = await Promise.all(stores.map((s) => s.list()));
  return listings.flat().reduce((sum, o) => sum + o.size, 0);
}

/** Throws OverStorageBudget, naming the numbers, if this sync would end over budget. */
export function assertWithinBudget(usedBytes: number, existing: StoredObject[], uploads: ReadonlyMap<string, number>, removals: readonly string[]) {
  const change = syncChangeBytes(new Map(existing.map((o) => [o.key, o.size])), uploads, removals);
  const check = checkStorageBudget(usedBytes, change);
  console.log(`Storage: ${formatGB(check.usedBytes)} used, ${formatGB(check.afterBytes)} after this sync, budget ${formatGB(check.budgetBytes)}.`);
  if (!check.ok)
    throw new OverStorageBudget(
      `Stopped: this would take storage to ${formatGB(check.afterBytes)}, over the ${formatGB(check.budgetBytes)} budget that keeps R2 free. Nothing was changed. Remove or trim clips, or raise STORAGE_BUDGET_BYTES knowingly.`,
    );
}

/**
 * Keeps photo storage inside Cloudflare R2's free tier. The free 10 GB is per account, so the public
 * bucket (web copies) and the private one (originals, editor previews) count together. Every path that
 * adds files (the upload page, npm run media:upload, npm run media:backup) checks here first, and refuses
 * when the space can't be measured: a guardrail that fails open isn't one.
 */

/** R2's free storage: 10 GB-month for the whole account (Cloudflare counts GB as 10^9 bytes). */
export const R2_FREE_STORAGE_BYTES = 10 * 1000 ** 3;
/** Uploads stop at 80% of the free tier, so a burst of uploads or a slow cleanup can't tip it over. */
export const STORAGE_BUDGET_BYTES = 8 * 1000 ** 3;

export interface BudgetCheck {
  ok: boolean;
  usedBytes: number;
  afterBytes: number;
  budgetBytes: number;
}

/** Would `usedBytes` stored, changed by `changeBytes` (negative when files are removed), stay within budget? */
export function checkStorageBudget(usedBytes: number, changeBytes: number, budgetBytes = STORAGE_BUDGET_BYTES): BudgetCheck {
  const afterBytes = Math.max(0, usedBytes + changeBytes);
  // Shrinking is always allowed, even over budget: it's how you get back under.
  return { ok: changeBytes <= 0 || afterBytes <= budgetBytes, usedBytes, afterBytes, budgetBytes };
}

/**
 * Net change in stored bytes from a sync: new and replaced files add their size, replacing a file frees
 * its old size, and removals free theirs.
 */
export function syncChangeBytes(existing: ReadonlyMap<string, number>, uploads: ReadonlyMap<string, number>, removals: readonly string[]): number {
  let change = 0;
  for (const [key, size] of uploads) change += size - (existing.get(key) ?? 0);
  for (const key of removals) change -= existing.get(key) ?? 0;
  return change;
}

export const formatGB = (bytes: number) => `${(bytes / 1000 ** 3).toFixed(2)} GB`;

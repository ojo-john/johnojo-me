import { describe, expect, it, vi } from "vitest";
import { STORAGE_BUDGET_BYTES } from "../src/lib/media-admin/budget";
import { accountBytes, assertWithinBudget, OverStorageBudget } from "../scripts/lib/budget-guard";
import { memoryStore } from "../scripts/lib/store";

vi.spyOn(console, "log").mockImplementation(() => {});

describe("accountBytes", () => {
  it("accountBytes_twoBuckets_addsBoth", async () => {
    const bytes = await accountBytes([memoryStore({ a: Buffer.alloc(3) }), memoryStore({ b: Buffer.alloc(4) })]);
    expect(bytes).toBe(7);
  });

  it("accountBytes_bucketUnreachable_rejects", async () => {
    const down = { ...memoryStore(), list: () => Promise.reject(new Error("timeout")) };
    await expect(accountBytes([memoryStore(), down])).rejects.toThrow("timeout");
  });
});

describe("assertWithinBudget", () => {
  it("assertWithinBudget_syncPassesBudget_throwsOverStorageBudget", () => {
    expect(() => assertWithinBudget(STORAGE_BUDGET_BYTES, [], new Map([["k", 1]]), [])).toThrow(OverStorageBudget);
  });

  it("assertWithinBudget_overBudgetButOnlyRemoving_passes", () => {
    expect(() => assertWithinBudget(STORAGE_BUDGET_BYTES + 10, [{ key: "k", size: 10, etag: "" }], new Map(), ["k"])).not.toThrow();
  });
});

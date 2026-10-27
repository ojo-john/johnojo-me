import { describe, expect, it } from "vitest";
import { checkStorageBudget, formatGB, STORAGE_BUDGET_BYTES, syncChangeBytes } from "./budget";

const GB = 1000 ** 3;

describe("checkStorageBudget", () => {
  it("checkStorageBudget_landsExactlyOnBudget_isAllowed", () => {
    expect(checkStorageBudget(STORAGE_BUDGET_BYTES - GB, GB).ok).toBe(true);
  });

  it("checkStorageBudget_oneByteOverBudget_isRefused", () => {
    expect(checkStorageBudget(STORAGE_BUDGET_BYTES - GB, GB + 1).ok).toBe(false);
  });

  it("checkStorageBudget_alreadyOverButShrinking_isAllowed", () => {
    expect(checkStorageBudget(STORAGE_BUDGET_BYTES + GB, -1).ok).toBe(true);
  });

  it("checkStorageBudget_removalLargerThanUsage_neverGoesNegative", () => {
    expect(checkStorageBudget(5, -10).afterBytes).toBe(0);
  });
});

describe("syncChangeBytes", () => {
  it("syncChangeBytes_nothingToDo_isZero", () => {
    expect(syncChangeBytes(new Map([["a", 5]]), new Map(), [])).toBe(0);
  });

  it("syncChangeBytes_replaceAndRemove_countsOnlyTheDifference", () => {
    const existing = new Map([["a", 100], ["b", 40]]);
    expect(syncChangeBytes(existing, new Map([["a", 120], ["c", 10]]), ["b"])).toBe(20 + 10 - 40);
  });

  it("syncChangeBytes_removingUnknownKey_freesNothing", () => {
    expect(syncChangeBytes(new Map(), new Map(), ["ghost"])).toBe(0);
  });
});

describe("formatGB", () => {
  it("formatGB_bytes_showsTwoDecimals", () => {
    expect(formatGB(2_812_000_000)).toBe("2.81 GB");
  });
});

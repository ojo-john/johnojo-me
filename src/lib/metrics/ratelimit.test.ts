import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./ratelimit";

describe("createRateLimiter", () => {
  it("allow_overLimitInWindow_refuses", () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    expect([allow("a"), allow("a"), allow("a")]).toEqual([true, true, false]);
  });

  it("allow_otherKey_isCountedSeparately", () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    allow("a");
    expect(allow("b")).toBe(true);
  });

  it("allow_afterWindow_resets", () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    allow("a");
    allow("a");
    t = 1000;
    expect(allow("a")).toBe(true);
  });

  it("allow_manyKeys_staysBounded", () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2, now: () => 0 });
    allow("a");
    allow("b");
    allow("c");
    // Memory was reset when full, so "a" starts a fresh window instead of being refused forever.
    expect(allow("a")).toBe(true);
  });
});

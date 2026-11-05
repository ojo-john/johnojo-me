import { describe, expect, it } from "vitest";
import { rating } from "./schema";

describe("rating scores", () => {
  it("rating_halfPoint_isAccepted", () => {
    expect(rating.safeParse({ scores: { culture: 6.5 } }).success).toBe(true);
  });

  it("rating_notAHalfPoint_isRejected", () => {
    expect(rating.safeParse({ scores: { culture: 6.3 } }).success).toBe(false);
  });

  it("rating_aboveTen_isRejected", () => {
    expect(rating.safeParse({ scores: { culture: 10.5 } }).success).toBe(false);
  });
});

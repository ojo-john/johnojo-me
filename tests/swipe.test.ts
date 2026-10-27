import { describe, expect, it } from "vitest";
import { clampIndex, railOffset, SWIPE_PX, swipeStep } from "@/lib/swipe";

describe("swipeStep", () => {
  it("swipeStep_leftSwipePastThreshold_movesToNext", () => {
    expect(swipeStep(-(SWIPE_PX + 1), 0)).toBe(1);
  });
  it("swipeStep_rightSwipePastThreshold_movesToPrevious", () => {
    expect(swipeStep(SWIPE_PX + 1, 0)).toBe(-1);
  });
  it("swipeStep_exactlyAtThreshold_stays", () => {
    expect(swipeStep(-SWIPE_PX, 0)).toBe(0);
  });
  it("swipeStep_mostlyVerticalMove_staysSoThePageScrolls", () => {
    expect(swipeStep(-80, 120)).toBe(0);
  });
  it("swipeStep_diagonalButMostlySideways_moves", () => {
    expect(swipeStep(-120, 80)).toBe(1);
  });
  it("swipeStep_noMovement_stays", () => {
    expect(swipeStep(0, 0)).toBe(0);
  });
});

describe("clampIndex", () => {
  it("clampIndex_beforeFirst_returnsFirst", () => {
    expect(clampIndex(-1, 5)).toBe(0);
  });
  it("clampIndex_pastLast_returnsLast", () => {
    expect(clampIndex(5, 5)).toBe(4);
  });
  it("clampIndex_inRange_unchanged", () => {
    expect(clampIndex(2, 5)).toBe(2);
  });
});

describe("railOffset", () => {
  it("railOffset_firstSlide_flushLeft", () => {
    expect(railOffset(0, 5)).toBe("0px");
  });
  it("railOffset_singlePhoto_noShift", () => {
    expect(railOffset(0, 1)).toBe("0px");
  });
  it("railOffset_middleSlide_centredWithNeighboursPeeking", () => {
    expect(railOffset(2, 5)).toBe("calc(6% - 2 * (88% + 10px))");
  });
  it("railOffset_lastSlide_flushRight", () => {
    expect(railOffset(4, 5)).toBe("calc(12% - 4 * (88% + 10px))");
  });
});

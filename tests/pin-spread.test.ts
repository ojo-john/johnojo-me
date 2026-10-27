import { describe, expect, it } from "vitest";
import { nearestGap, spreadPins } from "@/lib/pin-spread";

const gap = (a: { px: number; py: number }, b: { px: number; py: number }) => Math.hypot(a.px - b.px, a.py - b.py);

describe("spreadPins", () => {
  it("spreadPins_noPins_returnsEmpty", () => {
    expect(spreadPins([], 30)).toEqual([]);
  });

  it("spreadPins_farApart_keepExactPositions", () => {
    const out = spreadPins([{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }], 30);
    expect(out.map((p) => [p.px, p.py, p.moved])).toEqual([[0, 0, false], [100, 0, false]]);
  });

  it("spreadPins_threeCrowdedPins_endUpAtLeastMinDistanceApart", () => {
    const out = spreadPins([{ id: "bruges", x: 100, y: 100 }, { id: "ghent", x: 108, y: 104 }, { id: "brussels", x: 118, y: 110 }], 30);
    expect([gap(out[0], out[1]) >= 29.9, gap(out[1], out[2]) >= 29.9, gap(out[0], out[2]) >= 29.9, out.every((p) => p.moved)]).toEqual([true, true, true, true]);
  });

  it("spreadPins_identicalPositions_stillSeparate", () => {
    const out = spreadPins([{ id: "a", x: 50, y: 50 }, { id: "b", x: 50, y: 50 }], 20);
    expect(gap(out[0], out[1])).toBeGreaterThanOrEqual(19.9);
  });

  it("spreadPins_crowdNextToLonePin_leavesTheLonePinAlone", () => {
    const out = spreadPins([{ id: "a", x: 0, y: 0 }, { id: "b", x: 5, y: 0 }, { id: "far", x: 500, y: 500 }], 30);
    expect(out[2]).toMatchObject({ px: 500, py: 500, moved: false });
  });
});

describe("nearestGap", () => {
  const pins = [
    { id: "bruges", px: 0, py: 0 },
    { id: "ghent", px: 30, py: 40 },
    { id: "brussels", px: 100, py: 0 },
  ];

  it("nearestGap_crowdedPin_isDistanceToClosestNeighbour", () => {
    expect(nearestGap(pins, "bruges")).toBe(50);
  });

  it("nearestGap_onlyPin_isInfinite", () => {
    expect(nearestGap([{ id: "porto", px: 5, py: 5 }], "porto")).toBe(Infinity);
  });

  it("nearestGap_unknownId_isInfinite", () => {
    expect(nearestGap(pins, "nowhere")).toBe(Infinity);
  });
});

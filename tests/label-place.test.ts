import { describe, expect, it } from "vitest";
import { placeLabels } from "../src/lib/label-place";

const opts = { pinR: 10, fontSize: 12 };

describe("placeLabels", () => {
  it("placeLabels_lonePin_goesToTheRight", () => {
    expect(placeLabels([{ id: "nice", x: 100, y: 100, label: "Nice" }], opts)[0]).toMatchObject({ side: "right", anchor: "start" });
  });

  it("placeLabels_neighbourOnTheRight_movesToAnotherSide", () => {
    const [a] = placeLabels(
      [
        { id: "bruges", x: 100, y: 100, label: "Bruges" },
        { id: "ghent", x: 130, y: 100, label: "Ghent" },
      ],
      opts,
    );
    expect(a.side).not.toBe("right");
  });

  it("placeLabels_twoLabelsNearby_doNotShareASpot", () => {
    const placed = placeLabels(
      [
        { id: "a", x: 100, y: 100, label: "Brussels" },
        { id: "b", x: 100, y: 125, label: "Ghent" },
      ],
      opts,
    );
    expect(new Set(placed.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size).toBe(2);
  });

  it("placeLabels_noPins_isEmpty", () => {
    expect(placeLabels([], opts)).toEqual([]);
  });

  it("placeLabels_rightBlocked_goesLeftAnchoredAtTheEnd", () => {
    const placed = placeLabels(
      [
        { id: "a", x: 100, y: 100, label: "London" },
        { id: "b", x: 140, y: 100, label: "X" },
      ],
      opts,
    );
    expect(placed.find((p) => p.id === "a")).toMatchObject({ side: "left", anchor: "end" });
  });

  it("placeLabels_skipCrowdedAndNoClearSpot_hidesTheName", () => {
    // Eight neighbours box Brussels in on every side.
    const ring = [[-30, 0], [30, 0], [0, -22], [0, 22], [-30, -22], [30, -22], [-30, 22], [30, 22]].map(([dx, dy], i) => ({ id: `n${i}`, x: 100 + dx, y: 100 + dy, label: "Neighbour" }));
    const placed = placeLabels([{ id: "brussels", x: 100, y: 100, label: "Brussels" }, ...ring], { ...opts, skipCrowded: true });
    expect(placed.find((p) => p.id === "brussels")?.hidden).toBe(true);
  });

  it("placeLabels_hiddenName_doesNotBlockOthers", () => {
    const placed = placeLabels(
      [
        { id: "a", x: 100, y: 100, label: "Aaaaaaaaaaaaaaaaaaaa" },
        { id: "b", x: 100, y: 300, label: "B" },
      ],
      { ...opts, skipCrowded: true },
    );
    expect(placed.every((p) => !p.hidden)).toBe(true);
  });

  it("placeLabels_pinAtRightEdge_putsNameInsideTheMap", () => {
    const [p] = placeLabels([{ id: "philadelphia", x: 790, y: 300, label: "Philadelphia" }], { ...opts, bounds: { x0: 0, y0: 0, x1: 800, y1: 600 } });
    expect(p).toMatchObject({ side: "left", anchor: "end" });
  });

  it("placeLabels_pinAtBottomEdge_neverPutsNameBelow", () => {
    const [p] = placeLabels(
      [
        { id: "aruba", x: 400, y: 595, label: "Aruba" },
        { id: "right", x: 430, y: 595, label: "R" },
        { id: "left", x: 370, y: 595, label: "L" },
      ],
      { ...opts, bounds: { x0: 0, y0: 0, x1: 800, y1: 600 } },
    ).filter((l) => l.id === "aruba");
    expect(["below", "lower-left", "lower-right"]).not.toContain(p.side);
  });
});

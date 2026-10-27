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
});

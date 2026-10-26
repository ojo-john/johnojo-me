import { describe, expect, it } from "vitest";
import { focusFromFaces } from "@/lib/content/focus";

describe("focusFromFaces", () => {
  it("focusFromFaces_noFaces_returnsNull", () => {
    expect(focusFromFaces([])).toBeNull();
  });

  it("focusFromFaces_oneFace_centresOnIt", () => {
    expect(focusFromFaces([{ x: 0.4, y: 0.2, w: 0.2, h: 0.2 }])).toEqual({ x: 50, y: 30 });
  });

  it("focusFromFaces_tinyBackgroundFace_isIgnored", () => {
    const subject = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const passerBy = { x: 0.9, y: 0.9, w: 0.02, h: 0.02 };
    expect(focusFromFaces([subject, passerBy])).toEqual({ x: 20, y: 20 });
  });

  it("focusFromFaces_groupOfSimilarFaces_centresOnTheGroup", () => {
    expect(focusFromFaces([{ x: 0.1, y: 0.5, w: 0.1, h: 0.1 }, { x: 0.7, y: 0.5, w: 0.1, h: 0.1 }])).toEqual({ x: 45, y: 55 });
  });

  it("focusFromFaces_boxPastTheEdge_staysWithin0To100", () => {
    expect(focusFromFaces([{ x: 0.95, y: -0.1, w: 0.2, h: 0.1 }])).toEqual({ x: 100, y: 0 });
  });
});

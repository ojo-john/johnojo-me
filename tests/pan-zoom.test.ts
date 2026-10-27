import { describe, expect, it } from "vitest";
import { MAX_ZOOM, clampView, fullView, panBy, zoomAt, zoomLevel } from "../src/lib/pan-zoom";

const W = 800, H = 600;

describe("pan-zoom", () => {
  it("zoomAt_centre_keepsCentreInPlace", () => {
    const v = zoomAt(fullView(W, H), 2, 0.5, 0.5, W, H);
    expect(v).toEqual({ x: 200, y: 150, w: 400, h: 300 });
  });

  it("zoomAt_corner_keepsCornerInPlace", () => {
    expect(zoomAt(fullView(W, H), 2, 0, 0, W, H)).toMatchObject({ x: 0, y: 0 });
  });

  it("zoomAt_pastMaximum_stopsAtMaxZoom", () => {
    expect(zoomLevel(zoomAt(fullView(W, H), 100, 0.5, 0.5, W, H), W)).toBeCloseTo(MAX_ZOOM);
  });

  it("zoomAt_outPastWholeMap_returnsFullView", () => {
    expect(zoomAt(fullView(W, H), 0.2, 0.5, 0.5, W, H)).toEqual(fullView(W, H));
  });

  it("panBy_zoomedIn_movesOppositeToDrag", () => {
    const v = panBy({ x: 200, y: 150, w: 400, h: 300 }, 100, 0, 400, W, H);
    expect(v.x).toBe(100);
  });

  it("panBy_pastEdge_staysInsideMap", () => {
    expect(panBy({ x: 10, y: 10, w: 400, h: 300 }, 5000, 5000, 400, W, H)).toMatchObject({ x: 0, y: 0 });
  });

  it("clampView_zoomedOut_cannotPan", () => {
    expect(clampView({ x: 50, y: -20, w: W, h: H }, W, H)).toEqual(fullView(W, H));
  });
});

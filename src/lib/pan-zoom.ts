/**
 * The math behind zooming and panning an SVG map by changing its viewBox. Pure and unit-tested; the
 * browser wiring lives in usePanZoom.
 */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZOOM = 6;

/** Keep the view inside the map and between 1x and MAX_ZOOM. */
export function clampView(v: View, width: number, height: number): View {
  const w = Math.min(width, Math.max(width / MAX_ZOOM, v.w));
  const h = (w / width) * height;
  return { w, h, x: Math.min(width - w, Math.max(0, v.x)), y: Math.min(height - h, Math.max(0, v.y)) };
}

/** Zoom by `factor` (>1 = in) keeping the map point under (fx, fy), a 0–1 fraction of the view, in place. */
export function zoomAt(v: View, factor: number, fx: number, fy: number, width: number, height: number): View {
  const w = v.w / factor;
  const h = v.h / factor;
  return clampView({ w, h, x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy }, width, height);
}

/** Move the view by a drag of (dx, dy) screen pixels on an element `pxWidth` wide. */
export function panBy(v: View, dx: number, dy: number, pxWidth: number, width: number, height: number): View {
  const scale = v.w / pxWidth;
  return clampView({ ...v, x: v.x - dx * scale, y: v.y - dy * scale }, width, height);
}

export const fullView = (width: number, height: number): View => ({ x: 0, y: 0, w: width, h: height });
export const zoomLevel = (v: View, width: number) => width / v.w;

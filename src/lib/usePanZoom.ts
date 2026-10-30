"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { swallowClick } from "./metrics/track";
import { fullView, panBy, zoomAt, zoomLevel, type View } from "./pan-zoom";

/** How far a finger may move before a touch counts as a drag rather than a tap on a pin. */
const DRAG_THRESHOLD_PX = 6;
/** Each press of + or −, or a double-click, zooms by this much. */
const STEP = 1.6;

/**
 * Pinch to zoom and drag to pan an SVG map, by changing its viewBox. At 1x a single finger still scrolls
 * the page (touch-action: pan-y), so the map never traps someone scrolling past it; once zoomed in, one
 * finger pans the map. A drag never counts as a tap on a pin. zoomIn/zoomOut/reset back the on-screen
 * buttons, for people who can't pinch.
 */
export function usePanZoom(svgRef: RefObject<SVGSVGElement | null>, width: number, height: number) {
  const [view, setView] = useState<View>(() => fullView(width, height));
  // The pointer handlers read the latest view without re-subscribing on every change.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let dragged = false;

    const fraction = (clientX: number, clientY: number) => {
      const r = svg.getBoundingClientRect();
      return { fx: (clientX - r.left) / r.width, fy: (clientY - r.top) / r.height, pxWidth: r.width };
    };
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        moved = 0;
        dragged = false;
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (pointers.size >= 2) {
        // Pinch: zoom by the change in distance between the first two fingers, around their midpoint.
        const [a, b] = [...pointers.entries()];
        const other = a[0] === e.pointerId ? b[1] : a[1];
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(cur.x - other.x, cur.y - other.y);
        if (before > 0) {
          const { fx, fy } = fraction((cur.x + other.x) / 2, (cur.y + other.y) / 2);
          setView((v) => zoomAt(v, after / before, fx, fy, width, height));
        }
        dragged = true;
      } else if (zoomLevel(viewRef.current, width) > 1.01) {
        const { pxWidth } = fraction(cur.x, cur.y);
        setView((v) => panBy(v, cur.x - prev.x, cur.y - prev.y, pxWidth, width, height));
        moved += Math.hypot(cur.x - prev.x, cur.y - prev.y);
        if (moved > DRAG_THRESHOLD_PX && !dragged) {
          dragged = true;
          // Keep the drag going when the pointer leaves the map's edge. Only from here on: capturing on
          // press would retarget a plain click away from the pin under it.
          try {
            svg.setPointerCapture(e.pointerId);
          } catch {
            // The pointer is already gone (released between events); nothing to keep.
          }
        }
      }
      pointers.set(e.pointerId, cur);
    };
    const up = (e: PointerEvent) => pointers.delete(e.pointerId);
    // Leaving the map ends a press, unless the drag is captured (then it ends on release).
    const leave = (e: PointerEvent) => {
      if (!svg.hasPointerCapture(e.pointerId)) pointers.delete(e.pointerId);
    };
    // A drag or pinch ends with a click on whatever is under the finger: swallow it.
    const click = (e: MouseEvent) => {
      if (!dragged) return;
      e.stopPropagation();
      e.preventDefault();
      swallowClick(e);
      dragged = false;
    };
    // Pressing on a pin or a country (both links) and moving would start the browser's own "drag this
    // link" gesture, which cancels the pointer and stops the pan. The map never needs native drags.
    const noNativeDrag = (e: DragEvent) => e.preventDefault();
    // A mouse press on a pin or country would focus it, and Chrome then scrolls the page to keep the
    // focused element in view while the map moves under it, so the map slides off screen mid-drag.
    // Clicks still work; keyboard users still focus pins with Tab.
    const noFocusOnPress = (e: MouseEvent) => {
      if (e.button === 0) e.preventDefault();
    };
    // Double-click zooms in around the cursor, the usual map shortcut on a desktop.
    const dblclick = (e: MouseEvent) => {
      e.preventDefault();
      const { fx, fy } = fraction(e.clientX, e.clientY);
      setView((v) => zoomAt(v, STEP, fx, fy, width, height));
    };
    // Trackpad pinch and Ctrl+scroll zoom the map rather than the page.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { fx, fy } = fraction(e.clientX, e.clientY);
      setView((v) => zoomAt(v, Math.exp(-e.deltaY / 100), fx, fy, width, height));
    };
    svg.addEventListener("pointerdown", down);
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    svg.addEventListener("pointerleave", leave);
    svg.addEventListener("click", click, true);
    svg.addEventListener("wheel", wheel, { passive: false });
    svg.addEventListener("dragstart", noNativeDrag);
    svg.addEventListener("mousedown", noFocusOnPress);
    svg.addEventListener("dblclick", dblclick);
    return () => {
      svg.removeEventListener("mousedown", noFocusOnPress);
      svg.removeEventListener("dragstart", noNativeDrag);
      svg.removeEventListener("dblclick", dblclick);
      svg.removeEventListener("pointerdown", down);
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
      svg.removeEventListener("pointerleave", leave);
      svg.removeEventListener("click", click, true);
      svg.removeEventListener("wheel", wheel);
    };
  }, [svgRef, width, height]);

  const zoomIn = useCallback(() => setView((v) => zoomAt(v, STEP, 0.5, 0.5, width, height)), [width, height]);
  const zoomOut = useCallback(() => setView((v) => zoomAt(v, 1 / STEP, 0.5, 0.5, width, height)), [width, height]);
  const reset = useCallback(() => setView(fullView(width, height)), [width, height]);
  const zoom = zoomLevel(view, width);

  return {
    view,
    viewBox: `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`,
    /** Map units shrink as you zoom, so pins and labels can stay the same size on screen. */
    scale: view.w / width,
    zoomed: zoom > 1.01,
    zoom,
    zoomIn,
    zoomOut,
    reset,
    touchAction: zoom > 1.01 ? "none" : "pan-y",
    /** A grab hand once there's somewhere to drag to. */
    cursor: zoom > 1.01 ? "grab" : undefined,
  } as const;
}

"use client";

import { useEffect, useRef, type RefObject } from "react";
import { DRAG_PX, swipeStep } from "./swipe";

/** Pointer and touch events both report the same swipe; only the first one counts. */
const STEP_DEBOUNCE_MS = 400;
/** A trackpad's sideways scroll has to add up to this much (px) before it counts as a swipe. */
const WHEEL_STEP_PX = 50;

/**
 * Sideways swipes on an element: a finger, a mouse drag, or a two-finger trackpad scroll. `onStep` gets +1
 * (next) or -1 (previous); `onDrag` gets the live sideways offset so the content can follow, then 0 on
 * release. Where the swipe started and ended decides it, because iOS doesn't always send the moves in
 * between. The element needs touch-action: pan-y in CSS so vertical moves still scroll the page. The click
 * that ends a drag is swallowed so a swipe never opens a photo.
 */
export function useSwipe(ref: RefObject<HTMLElement | null>, onStep: (step: 1 | -1) => void, onDrag?: (dx: number) => void, enabled = true) {
  // Handlers read the latest callbacks without re-subscribing on every render.
  const step = useRef(onStep);
  const drag = useRef(onDrag);
  useEffect(() => {
    step.current = onStep;
    drag.current = onDrag;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let press: { id: number; x: number; y: number } | null = null;
    let touch: { x: number; y: number } | null = null;
    let suppressClick = false;
    let lastStep = 0;
    let wheelSum = 0;
    const follow = (dx: number) => drag.current?.(dx);
    const fire = (s: 1 | -1) => {
      if (Date.now() - lastStep < STEP_DEBOUNCE_MS) return;
      lastStep = Date.now();
      step.current(s);
    };
    const settle = (dx: number, dy: number) => {
      follow(0);
      if (Math.abs(dx) < DRAG_PX) return;
      suppressClick = true;
      const s = swipeStep(dx, dy);
      if (s) fire(s);
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      suppressClick = false;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const dx = e.clientX - press.x;
      if (Math.abs(dx) >= DRAG_PX && Math.abs(dx) > Math.abs(e.clientY - press.y)) follow(dx);
    };
    const up = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const { x, y } = press;
      press = null;
      settle(e.clientX - x, e.clientY - y);
    };
    // The browser took over (a vertical scroll): put things back.
    const cancel = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      press = null;
      follow(0);
    };
    // Backup for phones whose pointer events go missing mid-swipe: plain touch start and end positions.
    const touchStart = (e: TouchEvent) => {
      touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    };
    const touchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!touch || !t) return;
      const { x, y } = touch;
      touch = null;
      settle(t.clientX - x, t.clientY - y);
    };
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // Stops the browser treating the sideways scroll as "go back a page".
      e.preventDefault();
      if (Date.now() - lastStep < STEP_DEBOUNCE_MS) return;
      wheelSum += e.deltaX;
      if (Math.abs(wheelSum) < WHEEL_STEP_PX) return;
      const s = wheelSum > 0 ? 1 : -1;
      wheelSum = 0;
      fire(s);
    };
    const click = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    };
    // A mouse drag on a photo would otherwise start the browser's own "drag this image", cancelling ours.
    const noNativeDrag = (e: DragEvent) => e.preventDefault();
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchend", touchEnd, { passive: true });
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("click", click, true);
    el.addEventListener("dragstart", noNativeDrag);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("click", click, true);
      el.removeEventListener("dragstart", noNativeDrag);
    };
  }, [ref, enabled]);
}

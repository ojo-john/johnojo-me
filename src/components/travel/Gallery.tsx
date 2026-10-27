"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Picture } from "@/components/Picture";
import type { MediaItem } from "@/lib/content/media";
import { clampIndex, DRAG_PX, railOffset, swipeStep } from "@/lib/swipe";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** Pointer and touch events both report the same swipe; only the first one moves the strip. */
const STEP_DEBOUNCE_MS = 400;
/** A trackpad's sideways scroll has to add up to this much (px) before it turns the page of photos. */
const WHEEL_STEP_PX = 50;

/**
 * A stop's photos as a swipeable strip, the next photo peeking in so the pile is obvious; previous/next
 * buttons, arrow keys and trackpad scrolls work too. Selecting a photo opens it full size. The position is
 * announced politely ("3 of 12") so screen-reader users know where they are.
 *
 * The strip moves by a transform, like the full-screen viewer, not by native scrolling: iOS Safari and
 * trackpads fight scroll-snap when a script moves a scroller, which undid swipes on real devices.
 */
export function Gallery({ photos, label, onOpen, priority = false }: { photos: MediaItem[]; label: string; onOpen: (index: number) => void; priority?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = photos.length;
  const reducedMotion = useReducedMotion();

  const go = useCallback((to: number) => setIndex(clampIndex(to, count)), [count]);

  useEffect(() => {
    const el = viewport.current;
    const strip = rail.current;
    if (!el || !strip || count < 2) return;
    // The strip follows a finger or a mouse; touch-action: pan-y in the CSS hands vertical moves to the
    // browser, so the page still scrolls. Where the swipe started and ended decides it: iOS doesn't always
    // send the moves in between.
    let drag: { id: number; x: number; y: number } | null = null;
    let suppressClick = false;
    let lastStep = 0;
    const follow = (dx: number) => {
      strip.style.setProperty("--dx", `${dx}px`);
      strip.classList.toggle("dragging", dx !== 0);
    };
    const settle = (dx: number, dy: number) => {
      follow(0);
      if (Math.abs(dx) < DRAG_PX) return;
      // A drag ends with a click on the photo under the finger; that mustn't open it.
      suppressClick = true;
      const step = swipeStep(dx, dy);
      if (!step || Date.now() - lastStep < STEP_DEBOUNCE_MS) return;
      lastStep = Date.now();
      setIndex((i) => clampIndex(i + step, count));
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      suppressClick = false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) >= DRAG_PX && Math.abs(dx) > Math.abs(e.clientY - drag.y)) follow(dx);
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { x, y } = drag;
      drag = null;
      settle(e.clientX - x, e.clientY - y);
    };
    // The browser took over (a vertical scroll): put the strip back.
    const cancel = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      follow(0);
    };
    // Backup for phones whose pointer events go missing mid-swipe: plain touch start and end positions.
    let touch: { x: number; y: number } | null = null;
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
    // Two-finger sideways scroll on a trackpad (or Shift+wheel): one photo per flick.
    let wheelSum = 0;
    const wheel = (e: WheelEvent) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (Math.abs(dx) <= Math.abs(e.shiftKey ? 0 : e.deltaY)) return;
      // Stops the browser treating the sideways scroll as "go back a page".
      e.preventDefault();
      if (Date.now() - lastStep < STEP_DEBOUNCE_MS) return;
      wheelSum += dx;
      if (Math.abs(wheelSum) < WHEEL_STEP_PX) return;
      lastStep = Date.now();
      const step = wheelSum > 0 ? 1 : -1;
      wheelSum = 0;
      setIndex((i) => clampIndex(i + step, count));
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
  }, [count]);

  if (!count) return null;
  const many = count > 1;
  return (
    <div className="gal" role="region" aria-roledescription="carousel" aria-label={label}>
      <div
        ref={viewport}
        className={`gal-track${many ? "" : " one"}`}
        tabIndex={many ? 0 : -1}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          go(e.key === "ArrowRight" ? index + 1 : index - 1);
        }}
      >
        <div ref={rail} className={`gal-rail${reducedMotion ? " still" : ""}`} style={{ "--x": railOffset(index, count) } as CSSProperties}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="gal-slide"
              data-track="lightbox: open"
              onClick={() => onOpen(i)}
              // Tabbing onto a photo off to the side brings it into view.
              onFocus={() => go(i)}
              aria-label={`Open photo ${i + 1} of ${count}: ${p.caption ?? p.alt}`}
            >
              {/* The first photo of the first gallery on a page is usually the biggest thing on screen: load it first. */}
              <Picture photo={{ ...p, alt: "" }} sizes="(max-width: 900px) 88vw, 40vw" priority={priority && i === 0} />
              {p.caption ? <span className="cap">{p.caption}</span> : null}
            </button>
          ))}
        </div>
      </div>
      {many ? (
        <div className="gal-ctl">
          <button type="button" className="circ" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous photo">
            ‹
          </button>
          <span aria-live="polite" aria-atomic="true">
            {index + 1} of {count}
          </span>
          <button type="button" className="circ" onClick={() => go(index + 1)} disabled={index === count - 1} aria-label="Next photo">
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

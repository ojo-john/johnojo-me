"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Picture } from "@/components/Picture";
import type { MediaItem } from "@/lib/content/media";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** A sideways swipe at least this long (px) moves to the next photo. */
const SWIPE_PX = 40;
/** A finger or mouse has to move this far (px) sideways before a press counts as dragging the strip. */
const DRAG_PX = 6;

/**
 * A stop's photos as a swipeable strip: swipe (or scroll) on a phone, the next photo peeking in so the
 * pile is obvious; previous/next buttons and arrow keys elsewhere. Selecting a photo opens it full size.
 * The position is announced politely ("3 of 12") so screen-reader users know where they are.
 */
export function Gallery({ photos, label, onOpen }: { photos: MediaItem[]; label: string; onOpen: (index: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // The touch handlers read the current slide without re-subscribing on every change.
  const indexRef = useRef(0);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  const reducedMotion = useReducedMotion();

  // The slide whose centre is closest to the track's centre is the current one.
  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    const gaps = [...el.children].map((c) => Math.abs((c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth / 2 - mid));
    setIndex(gaps.indexOf(Math.min(...gaps)));
  }, []);

  const go = useCallback(
    (to: number) => {
      const el = track.current;
      const slide = el?.children[Math.max(0, Math.min(photos.length - 1, to))] as HTMLElement | undefined;
      if (!el || !slide) return;
      el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [photos.length, reducedMotion],
  );

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    // The strip follows a finger or a mouse directly. Native sideways scrolling isn't relied on (some phones
    // won't scroll a strip of buttons sideways); touch-action: pan-y in the CSS hands vertical moves to the
    // browser, so the page still scrolls. On release it settles on the next photo if the drag went far enough.
    let drag: { id: number; x: number; left: number; from: number; moved: number } | null = null;
    let suppressClick = false;
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      suppressClick = false;
      drag = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, from: indexRef.current, moved: 0 };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      if (drag.moved < DRAG_PX) return;
      el.classList.add("dragging");
      el.scrollLeft = drag.left - dx;
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const { from, moved } = drag;
      drag = null;
      el.classList.remove("dragging");
      if (moved < DRAG_PX) return;
      // A drag ends with a click on the photo under the finger; that mustn't open it.
      suppressClick = true;
      go(Math.abs(dx) > SWIPE_PX ? from + (dx < 0 ? 1 : -1) : from);
    };
    // The browser took over (a vertical scroll): put the strip back where it was.
    const cancel = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { from } = drag;
      drag = null;
      el.classList.remove("dragging");
      go(from);
    };
    const click = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("scroll", sync);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      el.removeEventListener("click", click, true);
    };
  }, [sync, go]);

  if (!photos.length) return null;
  const many = photos.length > 1;
  return (
    <div className="gal" role="region" aria-roledescription="carousel" aria-label={label}>
      <div
        ref={track}
        className={`gal-track${many ? "" : " one"}`}
        tabIndex={many ? 0 : -1}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          go(e.key === "ArrowRight" ? index + 1 : index - 1);
        }}
      >
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="gal-slide"
            data-track="lightbox: open"
            onClick={() => onOpen(i)}
            aria-label={`Open photo ${i + 1} of ${photos.length}: ${p.caption ?? p.alt}`}
          >
            <Picture photo={{ ...p, alt: "" }} sizes="(max-width: 900px) 88vw, 40vw" />
            {p.caption ? <span className="cap">{p.caption}</span> : null}
          </button>
        ))}
      </div>
      {many ? (
        <div className="gal-ctl">
          <button type="button" className="circ" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous photo">
            ‹
          </button>
          <span aria-live="polite" aria-atomic="true">
            {index + 1} of {photos.length}
          </span>
          <button type="button" className="circ" onClick={() => go(index + 1)} disabled={index === photos.length - 1} aria-label="Next photo">
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

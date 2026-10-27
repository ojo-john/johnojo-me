"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Picture } from "@/components/Picture";
import type { MediaItem } from "@/lib/content/media";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** A sideways swipe at least this long (px) moves to the next photo. */
const SWIPE_PX = 40;
/** A mouse has to move this far (px) before a press counts as dragging the strip. */
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
    // Swiping normally scrolls the strip natively. Some phones don't scroll a strip of buttons sideways,
    // so if a clear sideways swipe ends with the strip not having moved, step to the next or previous photo.
    let start: { x: number; y: number; left: number } | null = null;
    const touchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, left: el.scrollLeft } : null;
    };
    const touchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const moved = Math.abs(el.scrollLeft - start.left) > 4;
      if (!moved && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(indexRef.current + (dx < 0 ? 1 : -1));
      start = null;
    };
    // A mouse can't scroll a strip by dragging, so do it here: drag to move, release to settle on the
    // nearest photo. A drag never opens the photo it started on.
    let drag: { x: number; left: number; moved: number } | null = null;
    const mouseDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: el.scrollLeft, moved: 0 };
    };
    const mouseMove = (e: PointerEvent) => {
      if (!drag) return;
      drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.x));
      if (drag.moved < DRAG_PX) return;
      el.classList.add("dragging");
      el.scrollLeft = drag.left - (e.clientX - drag.x);
    };
    const mouseUp = () => {
      if (!drag) return;
      const wasDrag = drag.moved >= DRAG_PX;
      drag = null;
      el.classList.remove("dragging");
      if (wasDrag) {
        suppressClick = true;
        sync();
        go(indexRef.current);
      }
    };
    let suppressClick = false;
    const click = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    };
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchend", touchEnd, { passive: true });
    el.addEventListener("pointerdown", mouseDown);
    window.addEventListener("pointermove", mouseMove);
    window.addEventListener("pointerup", mouseUp);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("scroll", sync);
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("pointerdown", mouseDown);
      window.removeEventListener("pointermove", mouseMove);
      window.removeEventListener("pointerup", mouseUp);
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

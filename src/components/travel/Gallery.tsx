"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import { Picture } from "@/components/Picture";
import type { MediaItem } from "@/lib/content/media";
import { clampIndex, railOffset } from "@/lib/swipe";
import { useSwipe } from "@/lib/useSwipe";
import { useReducedMotion } from "@/lib/useReducedMotion";

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

  const follow = useCallback((dx: number) => {
    const strip = rail.current;
    if (!strip) return;
    strip.style.setProperty("--dx", `${dx}px`);
    strip.classList.toggle("dragging", dx !== 0);
  }, []);
  useSwipe(viewport, (step) => setIndex((i) => clampIndex(i + step, count)), follow, count > 1);

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

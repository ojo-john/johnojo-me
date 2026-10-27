"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Picture } from "@/components/Picture";
import type { MediaItem } from "@/lib/content/media";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * A stop's photos as a swipeable strip: swipe (or scroll) on a phone, the next photo peeking in so the
 * pile is obvious; previous/next buttons and arrow keys elsewhere. Selecting a photo opens it full size.
 * The position is announced politely ("3 of 12") so screen-reader users know where they are.
 */
export function Gallery({ photos, label, onOpen }: { photos: MediaItem[]; label: string; onOpen: (index: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  // The slide whose centre is closest to the track's centre is the current one.
  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    const gaps = [...el.children].map((c) => Math.abs((c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth / 2 - mid));
    setIndex(gaps.indexOf(Math.min(...gaps)));
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, [sync]);

  const go = (to: number) => {
    const el = track.current;
    const slide = el?.children[Math.max(0, Math.min(photos.length - 1, to))] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2, behavior: reducedMotion ? "auto" : "smooth" });
  };

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

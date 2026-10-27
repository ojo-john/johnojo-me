"use client";

import { useCallback, useRef, useState } from "react";
import { Picture } from "@/components/Picture";
import type { MediaItem } from "@/lib/content/media";
import { useSwipe } from "@/lib/useSwipe";
import { Lightbox, useLightbox } from "./Lightbox";

const TILT = [-2, 3, -5, 6, -7];

/** A shuffleable pile of the trip's photos: swipe, drag or use the buttons; the top photo opens full screen. */
export function PhotoPile({ photos }: { photos: MediaItem[] }) {
  const [top, setTop] = useState(0);
  const lb = useLightbox();
  const pile = useRef<HTMLDivElement>(null);
  const count = photos.length;
  const go = useCallback((d: number) => setTop((t) => (t + d + count) % count), [count]);
  // The top photo follows the finger, then the pile shuffles on release.
  const follow = useCallback((dx: number) => {
    const el = pile.current;
    if (!el) return;
    el.style.setProperty("--dx", `${dx}px`);
    el.classList.toggle("dragging", dx !== 0);
  }, []);
  useSwipe(pile, go, follow, count > 1);
  if (!count) return null;
  const current = photos[top];
  return (
    <section className="wrap stack-sec" aria-labelledby="pile-h">
      <span className="kicker" style={{ color: "var(--ink-2)" }}>
        Photos · {photos.length}
      </span>
      <h2 id="pile-h" style={{ fontSize: "clamp(40px,5vw,72px)", marginTop: 8 }}>
        The pile
      </h2>
      <div className="stackwrap">
        <div className="pstack" ref={pile}>
          {photos.map((p, i) => {
            const d = (i - top + photos.length) % photos.length;
            if (d > 5) return null;
            return (
              <button
                key={p.id}
                type="button"
                tabIndex={d === 0 ? 0 : -1}
                aria-hidden={d !== 0}
                aria-label={`Open photo full screen: ${p.caption ?? p.alt}`}
                data-track="lightbox: open"
                onClick={() => lb.open(photos, top)}
                style={{ zIndex: photos.length - d, transform: d === 0 ? "translateX(var(--dx, 0px)) rotate(-1deg)" : `translate(${d * 6}px, ${d * 4}px) rotate(${TILT[d % 5]}deg)`, opacity: d > 4 ? 0 : 1 }}
              >
                <Picture photo={d === 0 ? p : { ...p, alt: "" }} sizes="(max-width: 900px) 90vw, 55vw" />
              </button>
            );
          })}
        </div>
        <div className="stack-ctl">
          <p className="cap">{current.caption ?? ""}</p>
          {/* Swiping is the main way through; the arrows are for keyboards, screen readers and anyone who can't swipe. Tapping the photo opens it full screen. */}
          <div className="gal-ctl" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="circ" onClick={() => go(-1)} aria-label="Previous photo">
              ‹
            </button>
            <span aria-live="polite" aria-atomic="true">
              {top + 1} of {count}
            </span>
            <button type="button" className="circ" onClick={() => go(1)} aria-label="Next photo">
              ›
            </button>
          </div>
          <p className="mono" style={{ color: "var(--ink-2)", fontSize: 13 }}>
            Swipe or drag for the next photo. Tap a photo to see it full screen.
          </p>
        </div>
      </div>
      <Lightbox lb={lb} />
    </section>
  );
}

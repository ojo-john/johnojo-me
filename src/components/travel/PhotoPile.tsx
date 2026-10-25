"use client";

import { useState } from "react";
import { Picture } from "@/components/Picture";
import type { MediaItem } from "@/lib/content/media";
import { Lightbox, useLightbox } from "./Lightbox";

const TILT = [-2, 3, -5, 6, -7];

/** A shuffleable pile of the trip's photos; the top photo opens full screen. */
export function PhotoPile({ photos }: { photos: MediaItem[] }) {
  const [top, setTop] = useState(0);
  const lb = useLightbox();
  if (!photos.length) return null;
  const go = (d: number) => setTop((t) => (t + d + photos.length) % photos.length);
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
        <div className="pstack">
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
                style={{ zIndex: photos.length - d, transform: d === 0 ? "rotate(-1deg)" : `translate(${d * 6}px, ${d * 4}px) rotate(${TILT[d % 5]}deg)`, opacity: d > 4 ? 0 : 1 }}
              >
                <Picture photo={d === 0 ? p : { ...p, alt: "" }} sizes="(max-width: 900px) 90vw, 55vw" />
              </button>
            );
          })}
        </div>
        <div className="stack-ctl">
          <p className="cap">{current.caption ?? ""}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => go(-1)}>
              ← Back
            </button>
            <button className="btn fill" type="button" onClick={() => go(1)}>
              Next photo →
            </button>
            <button className="btn" type="button" data-track="lightbox: open" onClick={() => lb.open(photos, top)}>
              Full screen
            </button>
          </div>
          <p className="mono" style={{ color: "var(--ink-2)" }} aria-live="polite">
            {top + 1} / {photos.length}
          </p>
        </div>
      </div>
      <Lightbox lb={lb} />
    </section>
  );
}

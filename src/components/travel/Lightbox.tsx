"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fullSize } from "@/components/Picture";
import type { MediaItem } from "@/lib/content/media";

/**
 * Full-screen photo viewer on a native <dialog>: focus is trapped, Escape closes, arrow keys and
 * swipes move between photos, and focus returns to whatever opened it. Full-size images load only
 * when opened.
 */
export function useLightbox() {
  const [state, setState] = useState<{ items: MediaItem[]; index: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((items: MediaItem[], index: number) => {
    opener.current = document.activeElement as HTMLElement | null;
    setState({ items, index });
  }, []);
  const close = useCallback(() => {
    setState(null);
    opener.current?.focus();
  }, []);
  return { state, setState, open, close };
}

export function Lightbox({ lb }: { lb: ReturnType<typeof useLightbox> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const x0 = useRef<number | null>(null);
  const { state, setState, close } = lb;
  const step = useCallback((d: number) => setState((s) => (s ? { ...s, index: (s.index + d + s.items.length) % s.items.length } : s)), [setState]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (state && !d.open) d.showModal();
    if (!state && d.open) d.close();
  }, [state]);

  const item = state?.items[state.index];
  return (
    <dialog
      ref={ref}
      className="lb-dlg"
      aria-label="Photo viewer"
      onClose={close}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      }}
      onPointerDown={(e) => (x0.current = e.clientX)}
      onPointerUp={(e) => {
        if (x0.current === null) return;
        const dx = e.clientX - x0.current;
        x0.current = null;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      }}
    >
      {state && item ? (
        <div className="lb-in">
          <div className="lb-bar">
            <span className="mono">
              {state.index + 1} / {state.items.length}
            </span>
            <button className="circ" type="button" onClick={close} aria-label="Close viewer">
              ✕
            </button>
          </div>
          <div className="lb-img">
            {item.type === "video" ? (
              <video key={item.id} src={item.src} poster={item.poster || undefined} controls autoPlay playsInline width={item.w} height={item.h} aria-label={item.caption ?? item.alt} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- pre-optimised full-size variant
              <img key={item.id} src={fullSize(item)} width={item.w} height={item.h} alt={item.alt} />
            )}
          </div>
          <div className="lb-foot">
            <span>{item.caption ?? ""}</span>
            {state.items.length > 1 ? (
              <span style={{ display: "flex", gap: 8 }}>
                <button className="circ" type="button" onClick={() => step(-1)} aria-label="Previous photo">
                  ←
                </button>
                <button className="circ" type="button" onClick={() => step(1)} aria-label="Next photo">
                  →
                </button>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

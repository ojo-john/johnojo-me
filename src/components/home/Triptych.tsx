"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Three pillar panels. Hovering (mouse) or focusing a panel widens it; on narrow screens the panels
 * stack and show everything, so nothing depends on hover. Panels are server-rendered children.
 */
export function Triptych({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelOf = (e: React.SyntheticEvent) => (e.target as HTMLElement).closest<HTMLElement>("[data-i]")?.dataset.i ?? null;

  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>("[data-i]").forEach((p) => p.classList.toggle("is-open", p.dataset.i === open));
  }, [open]);

  return (
    <div
      ref={ref}
      className="tri"
      data-open={open ?? undefined}
      onPointerOver={(e) => e.pointerType === "mouse" && setOpen(panelOf(e))}
      onPointerLeave={() => setOpen(null)}
      onFocus={(e) => setOpen(panelOf(e))}
      onBlur={(e) => !ref.current?.contains(e.relatedTarget as Node) && setOpen(null)}
    >
      {children}
    </div>
  );
}

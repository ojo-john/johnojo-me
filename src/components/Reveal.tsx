"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Reveals [data-reveal] elements once as they scroll into view, using one IntersectionObserver per page
 * (no scroll handlers). Elements are only hidden after JS runs, and never under reduced motion.
 */
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const el = en.target as HTMLElement;
          el.style.transitionDelay = el.dataset.delay ? `${el.dataset.delay}ms` : "";
          el.classList.add("in");
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.12 },
    );
    for (const el of els) {
      // Anything already on screen stays visible; only below-the-fold content animates in.
      if (el.getBoundingClientRect().top < window.innerHeight) continue;
      el.classList.add("pre");
      io.observe(el);
    }
    return () => io.disconnect();
  }, [pathname]);
  return null;
}

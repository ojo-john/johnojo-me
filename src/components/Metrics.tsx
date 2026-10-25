"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { pageView, referrerHost, send, startClickTracking, trackingAllowed } from "@/lib/metrics/tracker";

/**
 * The site's own page-view and click counter (see docs/METRICS.md). Rendered only when the build sets
 * NEXT_PUBLIC_METRICS=1, so `next dev` and builds without the flag send nothing. Respects Do Not Track
 * and Global Privacy Control; sets no cookies and stores nothing in the browser.
 */
export function Metrics() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!trackingAllowed(navigator, window as { doNotTrack?: string | null })) return;
    // The referrer only means something for the first page; later pages are in-site navigation.
    const ref = first.current ? referrerHost(document.referrer, location.host) : "";
    first.current = false;
    send(pageView(pathname, ref), navigator);
  }, [pathname]);

  useEffect(() => (trackingAllowed(navigator, window as { doNotTrack?: string | null }) ? startClickTracking(document, window) : undefined), []);

  return null;
}

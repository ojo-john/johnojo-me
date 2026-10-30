"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isOwnerDevice, pageView, referrerHost, send, sourceTag, startClickTracking, trackingAllowed, withoutSourceTags } from "@/lib/metrics/tracker";

/** Visitors with privacy signals, automated browsers and the site owner's own devices aren't counted. */
const counting = () => trackingAllowed(navigator, window as { doNotTrack?: string | null }) && !isOwnerDevice(() => localStorage);

/**
 * The site's own page-view and click counter (see docs/METRICS.md). Rendered only when the build sets
 * NEXT_PUBLIC_METRICS=1, so `next dev` and builds without the flag send nothing. Respects Do Not Track
 * and Global Privacy Control; sets no cookies and stores nothing in a visitor's browser (it only reads the
 * flag the admin pages leave on the owner's own devices).
 */
export function Metrics() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    const entry = first.current;
    first.current = false;
    // Tidy a shared link's ?ref= tag out of the address bar either way, so copies don't carry it on.
    const tidy = entry ? withoutSourceTags(location.href) : null;
    if (counting()) {
      // Where they came from only means something for the first page; later pages are in-site navigation.
      const ref = entry ? referrerHost(document.referrer, location.host) || sourceTag(location.search) : "";
      send(pageView(pathname, ref, entry), navigator);
    }
    if (tidy) history.replaceState(history.state, "", tidy);
  }, [pathname]);

  useEffect(() => (counting() ? startClickTracking(document, window) : undefined), []);

  return null;
}

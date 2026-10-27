/**
 * The site's own visitor counter, in the browser. No cookies, no storage, no identifiers: each event
 * is a page path or a button name, sent once with navigator.sendBeacon and forgotten. Browsers that
 * ask not to be tracked (Do Not Track or Global Privacy Control) send nothing at all.
 */
import type { ClickEvent, MetricEvent, PageViewEvent } from "./events";
import { TRACK_EVENT } from "./track";

// Outside /api/* on purpose: Cloudflare Access guards /api/*, and visitors must reach this without a login.
export const COLLECT_URL = "/hit";

interface PrivacySignals {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

/** False when the browser signals Do Not Track or Global Privacy Control. */
export function trackingAllowed(nav: PrivacySignals, win?: { doNotTrack?: string | null }): boolean {
  if (nav.globalPrivacyControl === true) return false;
  const dnt = nav.doNotTrack ?? win?.doNotTrack;
  return !(dnt === "1" || dnt === "yes");
}

/** Only the referring site's host, and only when it's another site. */
export function referrerHost(referrer: string, selfHost: string): string {
  try {
    const host = new URL(referrer).host.toLowerCase();
    return host && host !== selfHost.toLowerCase() ? host.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

export const pageView = (path: string, ref = ""): PageViewEvent => ({ type: "page_view", path, ref });

/** The slice of the DOM the click reader needs, so it can be tested without a browser. */
export interface TrackableElement {
  closest(selector: string): TrackableElement | null;
  getAttribute(name: string): string | null;
  textContent: string | null;
}

/**
 * Turn a click into an event, or null when nothing worth counting was clicked. The name comes from a
 * data-track attribute when present (stable names like "year: 2024"), else the control's accessible name.
 * Form fields are never read.
 */
export function clickEvent(target: TrackableElement | null, loc: { pathname: string; origin: string; host: string }): ClickEvent | null {
  const el = target?.closest("[data-track], a[href], button, [role=button]");
  if (!el) return null;
  const href = el.getAttribute("href");
  let to = "";
  if (href) {
    try {
      const url = new URL(href, loc.origin);
      if (!/^https?:$/.test(url.protocol)) return null;
      to = url.host === loc.host ? url.pathname : url.host.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  const label = (el.getAttribute("data-track") ?? el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return null;
  return { type: "click", path: loc.pathname, label, to };
}

export function send(event: MetricEvent, nav: { sendBeacon?: (url: string, data: Blob) => boolean }) {
  // text/plain keeps the request "simple" (no CORS preflight); the server parses it as JSON.
  nav.sendBeacon?.(COLLECT_URL, new Blob([JSON.stringify(event)], { type: "text/plain" }));
}

/** Count clicks on links and buttons for the whole page with one listener. Returns the cleanup. */
export function startClickTracking(doc: Document, win: Window): () => void {
  const onClick = (e: MouseEvent) => {
    const ev = clickEvent(e.target instanceof Element ? e.target : null, win.location);
    if (ev) send(ev, win.navigator);
  };
  const onTrack = (e: Event) => {
    const label = (e as CustomEvent<string>).detail;
    if (typeof label === "string" && label) send({ type: "click", path: win.location.pathname, label, to: "" }, win.navigator);
  };
  doc.addEventListener("click", onClick, { capture: true, passive: true });
  win.addEventListener(TRACK_EVENT, onTrack);
  return () => {
    doc.removeEventListener("click", onClick, { capture: true });
    win.removeEventListener(TRACK_EVENT, onTrack);
  };
}

/**
 * The site's own visitor counter, in the browser. No cookies, no storage, no identifiers: each event
 * is a page path or a button name, sent once with navigator.sendBeacon and forgotten. Browsers that
 * ask not to be tracked (Do Not Track or Global Privacy Control) send nothing at all.
 */
import type { ClickEvent, MetricEvent, PageViewEvent } from "./events";
import { SOURCE_TAG } from "./events";
import { TRACK_EVENT, wasSwallowed } from "./track";

// Outside /api/* on purpose: Cloudflare Access guards /api/*, and visitors must reach this without a login.
const NEW_TAB_NOTE = /\(opens in a new tab\)/g;

export const COLLECT_URL = "/hit";

/** Set by the admin pages, so the site owner's own browsing isn't counted. Visitors never have it. */
export const OWNER_FLAG = "metrics:owner";
/** Query parameters a shared link can carry to say where it was posted, e.g. ?ref=linkedin. */
const SOURCE_PARAMS = ["ref", "utm_source"];

interface PrivacySignals {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  /** True in automated browsers (tests, scrapers). */
  webdriver?: boolean;
}

/** False for Do Not Track, Global Privacy Control, and automated browsers. */
export function trackingAllowed(nav: PrivacySignals, win?: { doNotTrack?: string | null }): boolean {
  if (nav.globalPrivacyControl === true || nav.webdriver === true) return false;
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

/** True on the site owner's own devices (set when they open an admin page). Unreadable storage means a visitor. */
export function isOwnerDevice(storage: () => Pick<Storage, "getItem">): boolean {
  try {
    return storage().getItem(OWNER_FLAG) === "1";
  } catch {
    return false;
  }
}

/** The source tag a shared link carries (?ref=linkedin), lowercased, or "" when there's none or it's malformed. */
export function sourceTag(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of SOURCE_PARAMS) {
    const tag = (params.get(name) ?? "").trim().toLowerCase();
    if (SOURCE_TAG.test(tag)) return tag;
  }
  return "";
}

/** The URL without its source tags, so a visitor who copies it doesn't pass the tag on. Null when there were none. */
export function withoutSourceTags(href: string): string | null {
  const url = new URL(href);
  if (!SOURCE_PARAMS.some((n) => url.searchParams.has(n))) return null;
  SOURCE_PARAMS.forEach((n) => url.searchParams.delete(n));
  return url.pathname + url.search + url.hash;
}

export const pageView = (path: string, ref = "", entry = false): PageViewEvent => ({ type: "page_view", path, ref, entry });

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
  // The screen-reader note on new-tab links isn't part of the link's name for counting.
  const label = (el.getAttribute("data-track") ?? el.getAttribute("aria-label") ?? el.textContent ?? "").replace(NEW_TAB_NOTE, "").replace(/\s+/g, " ").trim().slice(0, 80);
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
    const target = e.target instanceof Element ? e.target : null;
    // Decided once every handler has run: a click that ended a swipe is swallowed further down the page.
    win.setTimeout(() => {
      if (wasSwallowed(e)) return;
      const ev = clickEvent(target, win.location);
      if (ev) send(ev, win.navigator);
    }, 0);
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

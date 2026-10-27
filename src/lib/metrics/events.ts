/**
 * Site metrics events: the only two shapes the tracker may send to /hit, and the server-side
 * check that every field is short, plain and free of personal data before anything is stored.
 * Shared by the tracker (src/lib/metrics/tracker.ts) and the Pages Function (functions/hit.ts).
 */

export interface PageViewEvent {
  type: "page_view";
  /** Page path without query or hash, e.g. "/travel/europe-2024/". */
  path: string;
  /** Host of the site the visitor came from, e.g. "google.com", or "" for direct/internal. Never a full URL. */
  ref: string;
}

export interface ClickEvent {
  type: "click";
  path: string;
  /** What was clicked: a data-track name like "year: 2024", or the control's visible name. */
  label: string;
  /** Where a link goes: an internal path, or the host of an external site. "" for buttons. */
  to: string;
}

export type MetricEvent = PageViewEvent | ClickEvent;

export const LIMITS = { bodyBytes: 1024, path: 200, label: 80, host: 100 } as const;

const PATH = /^\/(?!\/)[A-Za-z0-9\-._~/%]*$/;
const HOST = /^(?=.{1,100}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/** Letters, digits, spaces and the punctuation the site's own labels use. Everything else is dropped. */
const LABEL_DISALLOWED = /[^\p{L}\p{N} .,:;'’&()/+#·→\-–]/gu;
/** Things that look like an email address or a phone/account number never belong in a label. */
const LOOKS_PERSONAL = /@|\d[\d\s-]{6,}\d/;

/** Strip query and hash, then accept only a plain site path. */
export function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/)[0];
  return path.length <= LIMITS.path && PATH.test(path) ? path : null;
}

export function cleanHost(value: unknown): string | null {
  if (value === "" || value === undefined) return "";
  if (typeof value !== "string") return null;
  const host = value.toLowerCase().replace(/^www\./, "");
  return HOST.test(host) ? host : null;
}

export function cleanLabel(value: unknown): string | null {
  // Checked before cleaning, which would otherwise strip the "@" that gives an email away.
  if (typeof value !== "string" || LOOKS_PERSONAL.test(value)) return null;
  const label = value.replace(LABEL_DISALLOWED, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.label).trim();
  return label || null;
}

/** A link target is either an internal path or an external host. */
function cleanTarget(value: unknown): string | null {
  if (value === "" || value === undefined) return "";
  return cleanPath(value) ?? cleanHost(value);
}

/**
 * Parse one beacon body. Returns null for anything that isn't exactly a valid event, so the caller can
 * answer 400 without storing a thing. Unknown fields are ignored and never stored.
 */
export function parseEvent(body: string): MetricEvent | null {
  if (body.length > LIMITS.bodyBytes) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const path = cleanPath(d.path);
  if (path === null) return null;
  if (d.type === "page_view") {
    const ref = cleanHost(d.ref);
    return ref === null ? null : { type: "page_view", path, ref };
  }
  if (d.type === "click") {
    const label = cleanLabel(d.label);
    const to = cleanTarget(d.to);
    return label === null || to === null ? null : { type: "click", path, label, to };
  }
  return null;
}

/** Column layout in Workers Analytics Engine. Changing the order breaks old rows, so only append. */
export function toDataPoint(e: MetricEvent): { blobs: string[]; doubles: number[]; indexes: string[] } {
  return e.type === "page_view"
    ? { blobs: [e.type, e.path, e.ref, ""], doubles: [1], indexes: [e.type] }
    : { blobs: [e.type, e.path, e.label, e.to], doubles: [1], indexes: [e.type] };
}

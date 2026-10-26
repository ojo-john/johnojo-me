import type { MediaItem } from "./media";

/**
 * The media files the public site actually shows: every size of every visible photo, plus each visible
 * clip and its poster. Hidden photos, duplicates and drafts never make it into a trip, so they're not
 * here, and the upload step leaves them (and removes them, if they were sent before) off public storage.
 * Returns bucket keys like "media/europe-2026/milan/photos/img-0995-960.jpg".
 */
export function publicMediaKeys(trips: { visits: { photos: MediaItem[]; videos: MediaItem[] }[] }[]): Set<string> {
  const keys = new Set<string>();
  const add = (webPath: string) => {
    if (webPath) keys.add(webPath.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, ""));
  };
  for (const item of trips.flatMap((t) => t.visits.flatMap((v) => [...v.photos, ...v.videos]))) {
    if (item.type === "photo") for (const v of item.variants) [v.avif, v.webp, v.jpg].forEach(add);
    else [item.src, item.poster].forEach(add);
  }
  return keys;
}

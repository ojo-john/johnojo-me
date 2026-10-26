/** How media is named everywhere: in the media folder, the buckets, the manifest and the site. */
import { editSignature, type PhotoEdit } from "../../src/lib/content/photo-edits";

/** Folder names: "sedona + flagstaff" → "sedona-flagstaff" (same rule as the site's loader). */
export const folderSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** File names lose their extension: "IMG_0995.jpeg" → "img-0995". */
export const fileSlug = (s: string) => folderSlug(s.replace(/\.[^.]+$/, ""));

export const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"]);
export const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v"]);
export type Kind = "photos" | "videos";

/** "europe-2026/milan/photos/img-0995" from the parts of an original's path. */
export const mediaId = (trip: string, city: string, kind: Kind, file: string) => `${trip}/${folderSlug(city)}/${kind}/${fileSlug(file)}`;

/**
 * An original's key in the originals bucket mirrors the media folder: "<trip>/<city>/<photos|videos>/<file>".
 * Returns null for anything else (editor working copies under _previews/, folders starting with "_",
 * files of the wrong type), so stray objects are never processed.
 */
export function originalKeyToId(key: string): { id: string; kind: Kind } | null {
  const parts = key.split("/");
  if (parts.length !== 4 || parts.some((p) => !p || p.startsWith("_") || p === "." || p === "..")) return null;
  const [trip, city, kind, file] = parts;
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  if (kind === "photos" && PHOTO_EXT.has(ext)) return { id: mediaId(trip, city, "photos", file), kind };
  if (kind === "videos" && VIDEO_EXT.has(ext)) return { id: mediaId(trip, city, "videos", file), kind };
  return null;
}

/** What a processed item was made from: the original's size and MD5, plus any edit. A change means re-make it. */
export const sourceKey = (size: number, md5: string, edit: PhotoEdit | undefined) => `${size}:${md5}${edit && editSignature(edit) ? `|${editSignature(edit)}` : ""}`;

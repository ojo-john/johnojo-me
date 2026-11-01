/**
 * Which web copies belong where, for the media commands. Public: visible photos and clips from published
 * and scheduled trips (scheduled ones go up early, because the daily scheduled publish only rebuilds the
 * site). Drafts: their copies, kept in the private bucket for the admin preview only.
 */
import { DRAFT_MEDIA_PREFIX } from "../../src/lib/media-admin/handlers";

export interface WantedMedia {
  /** Public bucket keys, e.g. "media/europe-2026/milan/photos/img-0995-960.jpg". */
  publicKeys: Set<string>;
  /** Drafts' web copies by their local key ("media/…"); stored privately under DRAFT_MEDIA_PREFIX. */
  draftKeys: Set<string>;
}

export async function wantedMedia(): Promise<WantedMedia> {
  // Read content as the live build does (no drafts, local /media paths), plus scheduled content. Set before
  // the content module loads: it reads these once, at import.
  Object.assign(process.env, { NODE_ENV: "production", SHOW_DRAFTS: "", INCLUDE_SCHEDULED: "1", MEDIA_BASE_URL: "" });
  const { getTrips, getTripsIncludingDrafts } = await import("../../src/lib/content/load");
  const { publicMediaKeys } = await import("../../src/lib/content/public-media");
  const publicKeys = publicMediaKeys(getTrips());
  const draftKeys = new Set([...publicMediaKeys(getTripsIncludingDrafts())].filter((key) => !publicKeys.has(key)));
  return { publicKeys, draftKeys };
}

export { DRAFT_MEDIA_PREFIX };

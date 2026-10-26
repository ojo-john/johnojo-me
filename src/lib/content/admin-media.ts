import type { ManifestEntry } from "./media";

/**
 * The photo list behind the editor's cover picker (/admin/media.json). Unlike the public site it
 * includes hidden photos and duplicates, flagged, so every upload can be seen and chosen from.
 */
export interface AdminPhoto {
  /** The value a cover field stores: "photos/img-1234" for a visit, "<folder>/photos/img-1234" for a trip. */
  file: string;
  thumb: string;
  /** A larger copy for the framing tool. */
  preview: string;
  /** Tiny blurred stand-in, shown if the thumbnail isn't on public storage (hidden photos never are). */
  placeholder: string;
  focus: { x: number; y: number } | null;
  /** The uncropped, unrotated working copy the photo tool draws on (private: local file or Access-only API). */
  edit: string;
  takenAt: string | null;
  hidden: boolean;
  duplicate: boolean;
}

/** One photo or clip in the editor's "Photos & videos" manager. */
export interface AdminMediaItem {
  /** "photos/img-1234" or "videos/img-1234", as the manager's lines name it. */
  file: string;
  kind: "photo" | "video";
  thumb: string;
  placeholder: string;
  /** Untrimmed / uncropped working copy for the manager (private: local file or Access-only API). */
  edit: string;
  takenAt: string | null;
  /** Hidden the older way (mediaMeta.hidden); hides set in the manager live in its own lines. */
  hidden: boolean;
  duplicate: boolean;
  /** A clip still over the size limit: shown in the manager so it can be trimmed. */
  tooLarge: boolean;
  duration: number | null;
}

/** Where the upload page can send originals: one per visit, drafts included. */
export interface UploadTarget {
  /** Visit file name without .yaml, e.g. "europe-2026--rome". */
  visit: string;
  label: string;
  /** Bucket folder for this visit's originals: "<trip>/<folder>". */
  path: string;
}

export interface AdminMediaIndex {
  /** Keyed by visit file name without .yaml, e.g. "europe-2026--barcelona". */
  visits: Record<string, AdminPhoto[]>;
  /** Keyed by trip slug: every photo from every stop on that trip. */
  trips: Record<string, AdminPhoto[]>;
  /** Keyed like `visits`: every photo and clip, oldest first, for the manager. */
  media: Record<string, AdminMediaItem[]>;
  uploadTargets: UploadTarget[];
}

/**
 * Where the photo tool loads a photo's uncropped working copy. Locally that's public/_edit (never shipped);
 * on the live site it's /api/preview, which reads the private originals bucket behind the admin login.
 */
export const editPreviewUrl = (id: string, live: boolean, ext: "jpg" | "mp4" = "jpg") => (live ? `/api/preview/${id}.${ext}` : `/_edit/${id}.${ext}`);

export interface AdminVisitInput {
  trip: string;
  visitSlug: string;
  /** The media folder slug ("nice-french-riviera"), already slugified. */
  folder: string;
  hiddenFiles: Set<string>;
  /** "Europe 2026 · Rome", for the upload page. */
  label?: string;
}

/** The smallest jpg that still looks sharp in a grid of thumbnails on a high-density screen. */
const thumbOf = (e: ManifestEntry & { type: "photo" }) => [...e.variants].sort((a, b) => a.w - b.w).find((v) => v.w >= 320)?.jpg ?? e.variants[0].jpg;

export function buildAdminMediaIndex(items: Record<string, ManifestEntry>, visits: AdminVisitInput[], live = false): AdminMediaIndex {
  const index: AdminMediaIndex = { visits: {}, trips: {}, media: {}, uploadTargets: [] };
  for (const v of visits) {
    const prefix = `${v.trip}/${v.folder}/`;
    const photos = Object.entries(items)
      .filter((pair): pair is [string, ManifestEntry & { type: "photo" }] => pair[0].startsWith(prefix + "photos/") && pair[1].type === "photo")
      .sort(([a, x], [b, y]) => (x.takenAt ?? a).localeCompare(y.takenAt ?? b))
      .map(([id, e]) => {
        const file = id.slice(prefix.length);
        const preview = ([...e.variants].sort((a, b) => a.w - b.w).find((v) => v.w >= 960) ?? e.variants[e.variants.length - 1]).jpg;
        return { file, thumb: thumbOf(e), preview, edit: editPreviewUrl(id, live), placeholder: e.placeholder, focus: e.focus ?? null, takenAt: e.takenAt, hidden: v.hiddenFiles.has(file), duplicate: Boolean(e.duplicateOf) };
      });
    index.visits[`${v.trip}--${v.visitSlug}`] = photos;
    index.media[`${v.trip}--${v.visitSlug}`] = Object.entries(items)
      .filter(([id]) => id.startsWith(prefix))
      .sort(([a, x], [b, y]) => (x.takenAt ?? a).localeCompare(y.takenAt ?? b))
      .map(([id, e]): AdminMediaItem => {
        const file = id.slice(prefix.length);
        const common = { file, takenAt: e.takenAt, hidden: v.hiddenFiles.has(file), duplicate: Boolean(e.duplicateOf) };
        return e.type === "photo"
          ? { ...common, kind: "photo", thumb: thumbOf(e), placeholder: e.placeholder, edit: editPreviewUrl(id, live), tooLarge: false, duration: null }
          : { ...common, kind: "video", thumb: e.poster, placeholder: "", edit: editPreviewUrl(id, live, "mp4"), tooLarge: Boolean(e.tooLarge), duration: e.duration ?? null };
      });
    index.uploadTargets.push({ visit: `${v.trip}--${v.visitSlug}`, label: v.label ?? `${v.trip} · ${v.visitSlug}`, path: `${v.trip}/${v.folder}` });
    index.trips[v.trip] = [...(index.trips[v.trip] ?? []), ...photos.map((p) => ({ ...p, file: `${v.folder}/${p.file}` }))];
  }
  return index;
}

import type { ManifestEntry } from "./media";

/**
 * The photo list behind the editor's cover picker (/admin/media.json). Unlike the public site it
 * includes hidden photos and duplicates, flagged, so every upload can be seen and chosen from.
 */
export interface AdminPhoto {
  /** The value a cover field stores: "photos/img-1234" for a visit, "<folder>/photos/img-1234" for a trip. */
  file: string;
  thumb: string;
  takenAt: string | null;
  hidden: boolean;
  duplicate: boolean;
}

export interface AdminMediaIndex {
  /** Keyed by visit file name without .yaml, e.g. "europe-2026--barcelona". */
  visits: Record<string, AdminPhoto[]>;
  /** Keyed by trip slug: every photo from every stop on that trip. */
  trips: Record<string, AdminPhoto[]>;
}

export interface AdminVisitInput {
  trip: string;
  visitSlug: string;
  /** The media folder slug ("nice-french-riviera"), already slugified. */
  folder: string;
  hiddenFiles: Set<string>;
}

/** The smallest jpg that still looks sharp in a grid of thumbnails on a high-density screen. */
const thumbOf = (e: ManifestEntry & { type: "photo" }) => [...e.variants].sort((a, b) => a.w - b.w).find((v) => v.w >= 320)?.jpg ?? e.variants[0].jpg;

export function buildAdminMediaIndex(items: Record<string, ManifestEntry>, visits: AdminVisitInput[]): AdminMediaIndex {
  const index: AdminMediaIndex = { visits: {}, trips: {} };
  for (const v of visits) {
    const prefix = `${v.trip}/${v.folder}/`;
    const photos = Object.entries(items)
      .filter((pair): pair is [string, ManifestEntry & { type: "photo" }] => pair[0].startsWith(prefix + "photos/") && pair[1].type === "photo")
      .sort(([a, x], [b, y]) => (x.takenAt ?? a).localeCompare(y.takenAt ?? b))
      .map(([id, e]) => {
        const file = id.slice(prefix.length);
        return { file, thumb: thumbOf(e), takenAt: e.takenAt, hidden: v.hiddenFiles.has(file), duplicate: Boolean(e.duplicateOf) };
      });
    index.visits[`${v.trip}--${v.visitSlug}`] = photos;
    index.trips[v.trip] = [...(index.trips[v.trip] ?? []), ...photos.map((p) => ({ ...p, file: `${v.folder}/${p.file}` }))];
  }
  return index;
}

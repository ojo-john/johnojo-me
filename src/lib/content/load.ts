import "server-only";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import { buildAdminMediaIndex, type AdminMediaIndex } from "./admin-media";
import { manifest as manifestSchema, type Manifest, type MediaItem } from "./media";
import { scoreState, type ScoreState } from "./ranking";
import {
  destination as destinationSchema,
  destinations as destinationsSchema,
  experience as experienceSchema,
  FOCUS_Y,
  parseFocus,
  post as postSchema,
  project as projectSchema,
  site as siteSchema,
  trip as tripSchema,
  visit as visitSchema,
  type Destination,
  type PostFrontmatter,
  type Project,
  type Status,
  type Trip,
  type Visit,
} from "./schema";

/**
 * Build-time content loader. Reads /content, validates every file, resolves cross-references
 * (visit → destination, media ids → manifest) and hides drafts from production builds.
 */

const CONTENT_DIR = process.env.CONTENT_DIR ?? path.join(process.cwd(), "content");

/**
 * Drafts are opt-in: only `npm run dev:drafts` (or any build with SHOW_DRAFTS=1) shows them. Plain
 * `npm run dev` matches the live site exactly.
 */
export const SHOW_DRAFTS = process.env.SHOW_DRAFTS === "1";
/** A missing photo is fatal only in a real build; while editing locally it's skipped until `npm run media` runs. */
const LENIENT_MEDIA = process.env.NODE_ENV !== "production" || SHOW_DRAFTS;
const visible = (s: Status) => s !== "draft" || SHOW_DRAFTS;

class ContentError extends Error {
  constructor(file: string, detail: string) {
    super(`Invalid content in ${path.relative(process.cwd(), file)}:\n${detail}`);
    this.name = "ContentError";
  }
}

function parseFile<T extends z.ZodType>(file: string, schema: T): z.infer<T> {
  const raw = fs.readFileSync(file, "utf8");
  const data = file.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ContentError(file, result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n"));
  }
  return result.data;
}

/**
 * Content is read once per build. Under `next dev` the YAML files aren't module imports, so a permanent
 * cache would keep serving old content until a restart; there, entries expire after a moment instead,
 * long enough to cover one page render.
 */
const DEV_CACHE_MS = 1500;
const IS_DEV_SERVER = process.env.NODE_ENV === "development";
const memo = <T,>(fn: () => T) => {
  let value: T | undefined;
  let readAt = 0;
  return () => {
    if (value === undefined || (IS_DEV_SERVER && Date.now() - readAt > DEV_CACHE_MS)) {
      value = fn();
      readAt = Date.now();
    }
    return value;
  };
};
const dir = (...p: string[]) => path.join(CONTENT_DIR, ...p);
const list = (d: string, ext: string) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(ext)).sort() : []);

export const getSite = memo(() => parseFile(dir("site.yaml"), siteSchema));
export const getExperience = memo(() => parseFile(dir("experience.yaml"), experienceSchema));
/** One file per place in content/destinations; the file name is the place's id (e.g. porto.yaml). */
export const getDestinations = memo(() =>
  destinationsSchema.parse(Object.fromEntries(list(dir("destinations"), ".yaml").map((f) => [f.replace(/\.yaml$/, ""), parseFile(dir("destinations", f), destinationSchema)]))),
);

/**
 * Where processed media is served from. Empty locally (files in public/media); in production set
 * MEDIA_BASE_URL to the R2 bucket's public domain, e.g. https://media.johnojo.me, and media URLs
 * become https://media.johnojo.me/media/<trip>/<city>/...
 */
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL ?? "").replace(/\/$/, "");
const withBase = (u: string) => (u && u.startsWith("/") ? MEDIA_BASE_URL + u : u);

export const getMediaManifest = memo((): Manifest => {
  const file = dir("media-manifest.json");
  const m = fs.existsSync(file) ? parseFile(file, manifestSchema) : { generatedAt: "", items: {} };
  if (!MEDIA_BASE_URL) return m;
  for (const e of Object.values(m.items)) {
    if (e.type === "photo") e.variants = e.variants.map((v) => ({ ...v, avif: withBase(v.avif), webp: withBase(v.webp), jpg: withBase(v.jpg) }));
    else Object.assign(e, { src: withBase(e.src), poster: withBase(e.poster) });
  }
  return m;
});

export type ProjectEntry = Project & { slug: string };
export const getProjects = memo((): ProjectEntry[] =>
  list(dir("projects"), ".yaml")
    .map((f) => ({ slug: f.replace(/\.yaml$/, ""), ...parseFile(dir("projects", f), projectSchema) }))
    .filter((p) => visible(p.status))
    .sort((a, b) => a.order - b.order),
);

/* ---------------- travel ---------------- */

export type VisitEntry = Visit & {
  slug: string;
  tripSlug: string;
  place: Destination & { slug: string };
  score: ScoreState;
  photos: MediaItem[];
  videos: MediaItem[];
  coverPhoto: MediaItem | null;
};
export type TripEntry = Trip & { slug: string; visits: VisitEntry[]; coverPhoto: MediaItem | null };

/** Folder names are slugified by the media script, so "nice + french riviera" becomes "nice-french-riviera". */
const folderSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function resolveMedia(file: string, visitSlug: string, v: Visit, trip: Trip, place: Destination): MediaItem[] {
  const items = getMediaManifest().items;
  const prefix = `${v.trip}/${folderSlug(v.photoFolder ?? visitSlug)}/`;
  const ids =
    v.media?.map((id) => prefix + id) ??
    Object.keys(items)
      .filter((k) => k.startsWith(prefix))
      .sort((a, b) => (items[a].takenAt ?? a).localeCompare(items[b].takenAt ?? b));
  const out: MediaItem[] = [];
  for (const id of ids) {
    const entry = items[id];
    if (!entry) {
      if (!LENIENT_MEDIA) throw new ContentError(file, `  - media: "${id}" is not in media-manifest.json (run npm run media)`);
      continue;
    }
    if (entry.duplicateOf) continue; // near-identical copy of another photo or clip
    const key = id.slice(prefix.length);
    const meta = v.mediaMeta[key] ?? v.mediaMeta[key.split("/").pop() ?? key];
    if (meta?.hidden) continue;
    // A manual "keep in frame" choice overrides the automatic focus point top-to-bottom.
    const focus = meta?.focus && entry.type === "photo" ? { x: entry.focus?.x ?? 50, y: FOCUS_Y[meta.focus] } : entry.type === "photo" ? entry.focus : undefined;
    out.push({ ...entry, ...(focus ? { focus } : {}), id, caption: meta?.caption ?? null, alt: meta?.alt ?? `${meta?.caption ?? "Photo"} in ${place.city}, ${trip.title}` });
  }
  return out;
}

/** Apply the framing chosen in the editor (coverFocus) to a cover; the photo elsewhere keeps its own focus. */
const withFocus = (photo: MediaItem | null, focus: string | undefined): MediaItem | null => {
  const point = parseFocus(focus);
  return photo?.type === "photo" && point ? { ...photo, focus: point } : photo;
};

/** Visit files are named "<trip>--<visit>.yaml" in content/visits, one flat folder for every trip. */
const getVisitFiles = memo(() =>
  list(dir("visits"), ".yaml").map((f) => {
    const file = dir("visits", f);
    const v = parseFile(file, visitSchema);
    const [tripPart, visitSlug] = f.replace(/\.yaml$/, "").split("--");
    if (!visitSlug || tripPart !== v.trip) throw new ContentError(file, `  - file name must be "${v.trip}--<visit>.yaml" to match trip: ${v.trip}`);
    return { file, v, visitSlug };
  }),
);

export const getTrips = memo((): TripEntry[] => {
  const places = getDestinations();
  const tripsDir = dir("trips");
  const slugs = fs.existsSync(tripsDir) ? fs.readdirSync(tripsDir).filter((d) => fs.existsSync(path.join(tripsDir, d, "trip.yaml"))) : [];
  const visitFiles = getVisitFiles();
  for (const { file, v } of visitFiles) if (!slugs.includes(v.trip)) throw new ContentError(file, `  - trip: "${v.trip}" has no content/trips/${v.trip}/trip.yaml`);
  return slugs
    .map((tripSlug) => {
      const trip = parseFile(dir("trips", tripSlug, "trip.yaml"), tripSchema);
      const visits = visitFiles
        .filter(({ v }) => v.trip === tripSlug)
        .map(({ file, v, visitSlug }) => {
          const place = places[v.destination];
          if (!place) throw new ContentError(file, `  - destination: "${v.destination}" has no content/destinations/<id>.yaml`);
          const media = resolveMedia(file, visitSlug, v, trip, place);
          const photos = media.filter((m) => m.type === "photo");
          const coverPhoto = withFocus((v.cover && photos.find((p) => p.id.endsWith(v.cover as string))) || photos[0] || null, v.coverFocus);
          return {
            ...v,
            slug: visitSlug,
            tripSlug,
            place: { ...place, slug: v.destination },
            score: scoreState(v.rating),
            photos,
            videos: media.filter((m) => m.type === "video"),
            coverPhoto,
          } satisfies VisitEntry;
        })
        .filter((v) => visible(v.status))
        .sort((a, b) => a.order - b.order);
      const allPhotos = visits.flatMap((v) => v.photos);
      const coverPhoto = withFocus((trip.cover && allPhotos.find((p) => p.id.endsWith(trip.cover as string))) || visits.find((v) => v.coverPhoto)?.coverPhoto || null, trip.coverFocus);
      return { ...trip, slug: tripSlug, visits, coverPhoto } satisfies TripEntry;
    })
    .filter((t) => visible(t.status))
    .sort((a, b) => b.year - a.year || (b.start ?? "").localeCompare(a.start ?? ""));
});

/** Every photo per visit and per trip, hidden ones included, for the editor's cover picker. Drafts too. */
export function getAdminMediaIndex(): AdminMediaIndex {
  const items = getMediaManifest().items;
  return buildAdminMediaIndex(
    items,
    getVisitFiles().map(({ v, visitSlug }) => ({
      trip: v.trip,
      visitSlug,
      folder: folderSlug(v.photoFolder ?? visitSlug),
      hiddenFiles: new Set(Object.entries(v.mediaMeta).flatMap(([k, m]) => (m.hidden ? [k.includes("/") ? k : `photos/${k}`] : []))),
    })),
    Boolean(MEDIA_BASE_URL),
  );
}

export const getTrip = (slug: string) => getTrips().find((t) => t.slug === slug);

/** Every visible visit to a destination across all trips, oldest first, for then-vs-now comparisons. */
export function visitsTo(destination: string): VisitEntry[] {
  return getTrips()
    .flatMap((t) => t.visits.filter((v) => v.destination === destination))
    .sort((a, b) => (a.arrive ?? a.tripSlug).localeCompare(b.arrive ?? b.tripSlug));
}

/* ---------------- journal ---------------- */

export type PostEntry = PostFrontmatter & { slug: string; body: string; minutes: number };

function splitFrontmatter(file: string): { data: unknown; body: string } {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new ContentError(file, "  - missing --- frontmatter --- block");
  return { data: YAML.parse(m[1]), body: m[2] };
}

export const getPosts = memo((): PostEntry[] =>
  list(dir("journal"), ".mdx")
    .map((f) => {
      const file = dir("journal", f);
      const { data, body } = splitFrontmatter(file);
      const result = postSchema.safeParse(data);
      if (!result.success) throw new ContentError(file, result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"));
      const words = body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
      return { ...result.data, slug: f.replace(/\.mdx$/, ""), body, minutes: Math.max(1, Math.round(words / 220)) };
    })
    // V1 publishes public posts only; other visibility tiers are modelled but never built.
    .filter((p) => visible(p.status) && (p.visibility === "public" || SHOW_DRAFTS))
    .sort((a, b) => (b.publishedAt ?? "9999").localeCompare(a.publishedAt ?? "9999")),
);

export const getPost = (slug: string) => getPosts().find((p) => p.slug === slug);

/**
 * The Journal stays hidden (no nav tab, home panel, footer link or sitemap entry, and noindex on its
 * pages) until at least one real post is published and public. Drafts and samples never open it, even
 * in dev, so the local preview matches the live site; a draft can still be previewed at /journal/<slug>/.
 */
export function journalIsOpen(): boolean {
  return getPosts().some((p) => p.status === "published" && p.visibility === "public" && !p.sample);
}

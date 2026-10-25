import "server-only";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import { manifest as manifestSchema, type Manifest, type MediaItem } from "./media";
import { scoreState, type ScoreState } from "./ranking";
import {
  destinations as destinationsSchema,
  experience as experienceSchema,
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

/** Drafts show in `next dev` and in preview builds (SHOW_DRAFTS=1), never in a normal production build. */
export const SHOW_DRAFTS = process.env.NODE_ENV !== "production" || process.env.SHOW_DRAFTS === "1";
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

const memo = <T,>(fn: () => T) => {
  let value: T | undefined;
  return () => (value ??= fn());
};
const dir = (...p: string[]) => path.join(CONTENT_DIR, ...p);
const list = (d: string, ext: string) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(ext)).sort() : []);

export const getSite = memo(() => parseFile(dir("site.yaml"), siteSchema));
export const getExperience = memo(() => parseFile(dir("experience.yaml"), experienceSchema));
export const getDestinations = memo(() => parseFile(dir("destinations.yaml"), destinationsSchema));

export const getMediaManifest = memo((): Manifest => {
  const file = dir("media-manifest.json");
  return fs.existsSync(file) ? parseFile(file, manifestSchema) : { generatedAt: "", items: {} };
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
      if (!SHOW_DRAFTS) throw new ContentError(file, `  - media: "${id}" is not in media-manifest.json (run npm run media)`);
      continue;
    }
    const key = id.slice(prefix.length);
    const meta = v.mediaMeta[key] ?? v.mediaMeta[key.split("/").pop() ?? key];
    if (meta?.hidden) continue;
    out.push({ ...entry, id, caption: meta?.caption ?? null, alt: meta?.alt ?? `${meta?.caption ?? "Photo"} in ${place.city}, ${trip.title}` });
  }
  return out;
}

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
          if (!place) throw new ContentError(file, `  - destination: "${v.destination}" is not listed in content/destinations.yaml`);
          const media = resolveMedia(file, visitSlug, v, trip, place);
          const photos = media.filter((m) => m.type === "photo");
          const coverPhoto = (v.cover && photos.find((p) => p.id.endsWith(v.cover as string))) || photos[0] || null;
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
      const coverPhoto = (trip.cover && allPhotos.find((p) => p.id.endsWith(trip.cover as string))) || visits.find((v) => v.coverPhoto)?.coverPhoto || null;
      return { ...trip, slug: tripSlug, visits, coverPhoto } satisfies TripEntry;
    })
    .filter((t) => visible(t.status))
    .sort((a, b) => b.year - a.year || (b.start ?? "").localeCompare(a.start ?? ""));
});

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

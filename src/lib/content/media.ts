import { z } from "zod";

/**
 * Shape of content/media-manifest.json, written by `npm run media`. The site never reads original
 * photos; it only references the resized, metadata-stripped copies listed here.
 */
export const variant = z.object({ w: z.number().int(), avif: z.string(), webp: z.string(), jpg: z.string() });

export const photoEntry = z.object({
  type: z.literal("photo"),
  w: z.number().int(),
  h: z.number().int(),
  variants: z.array(variant).min(1),
  placeholder: z.string(),
  takenAt: z.string().nullable(),
  hash: z.string().optional(),
  /** What it was made from (original's size and MD5, plus any edit), so the media job knows when to re-make it. */
  source: z.string().optional(),
  /** Where the subject sits (percent across, percent down), found by npm run media. Crops keep this in frame. */
  focus: z.object({ x: z.number(), y: z.number() }).optional(),
  /** How focus was found: from faces, or (no faces) from colour and detail. */
  focusBy: z.enum(["faces", "attention"]).optional(),
  /** Set by npm run media when this picture is a near-identical copy of another one in the same city. */
  duplicateOf: z.string().optional(),
});

export const videoEntry = z.object({
  type: z.literal("video"),
  w: z.number().int(),
  h: z.number().int(),
  src: z.string(),
  poster: z.string(),
  takenAt: z.string().nullable(),
  hash: z.string().optional(),
  source: z.string().optional(),
  bytes: z.number().optional(),
  /** Length in seconds, for the editor's trim tool. */
  duration: z.number().optional(),
  /** Still over the size limit after compressing: not on the site until it's trimmed in the editor. */
  tooLarge: z.boolean().optional(),
  duplicateOf: z.string().optional(),
});

export const manifest = z.object({
  generatedAt: z.string(),
  items: z.record(z.string(), z.discriminatedUnion("type", [photoEntry, videoEntry])),
});
export type Manifest = z.infer<typeof manifest>;
export type ManifestEntry = Manifest["items"][string];

export type MediaItem = ManifestEntry & { id: string; caption: string | null; alt: string };

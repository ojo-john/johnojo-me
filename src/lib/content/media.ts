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
});

export const videoEntry = z.object({
  type: z.literal("video"),
  w: z.number().int(),
  h: z.number().int(),
  src: z.string(),
  poster: z.string(),
  takenAt: z.string().nullable(),
});

export const manifest = z.object({
  generatedAt: z.string(),
  items: z.record(z.string(), z.discriminatedUnion("type", [photoEntry, videoEntry])),
});
export type Manifest = z.infer<typeof manifest>;
export type ManifestEntry = Manifest["items"][string];

export type MediaItem = ManifestEntry & { id: string; caption: string | null; alt: string };

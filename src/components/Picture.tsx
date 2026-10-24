import type { MediaItem } from "@/lib/content/media";

/**
 * Responsive photo from the media manifest: AVIF, then WebP, then JPEG, each at several widths.
 * Explicit width/height reserve space (no layout shift) and a tiny blurred placeholder shows while
 * the real image loads. Only the hero image on a page should pass `priority`.
 */
export function Picture({
  photo,
  sizes,
  className,
  priority = false,
}: {
  photo: MediaItem;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  if (photo.type !== "photo") return null;
  const set = (k: "avif" | "webp" | "jpg") => photo.variants.map((v) => `${v[k]} ${v.w}w`).join(", ");
  const fallback = photo.variants.find((v) => v.w >= 960) ?? photo.variants[photo.variants.length - 1];
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={set("webp")} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element -- images are pre-optimised by scripts/media.ts */}
      <img
        src={fallback.jpg}
        srcSet={set("jpg")}
        sizes={sizes}
        width={photo.w}
        height={photo.h}
        alt={photo.alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        style={{ backgroundImage: `url(${photo.placeholder})`, backgroundSize: "cover" }}
      />
    </picture>
  );
}

/** Largest variant URL, for the full-screen viewer. */
export const fullSize = (photo: MediaItem) => (photo.type === "photo" ? photo.variants[photo.variants.length - 1].jpg : photo.poster);

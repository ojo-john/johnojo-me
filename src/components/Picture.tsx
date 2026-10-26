import { preload } from "react-dom";
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
  // The page's hero image starts downloading with the HTML instead of waiting for layout.
  if (priority) preload(photo.variants[0].avif, { as: "image", type: "image/avif", imageSrcSet: set("avif"), imageSizes: sizes, fetchPriority: "high" });
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={set("webp")} sizes={sizes} />
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
        // When a frame crops the photo, keep its subject (usually faces) in view instead of the middle.
        style={{
          backgroundImage: `url(${photo.placeholder})`,
          backgroundSize: "cover",
          ...(photo.focus ? { objectPosition: `${photo.focus.x}% ${photo.focus.y}%`, backgroundPosition: `${photo.focus.x}% ${photo.focus.y}%` } : {}),
        }}
      />
    </picture>
  );
}

/** Largest variant URL, for the full-screen viewer. */
export const fullSize = (photo: MediaItem) => (photo.type === "photo" ? photo.variants[photo.variants.length - 1].jpg : photo.poster);

import type { MetadataRoute } from "next";
import { getPosts, getSite, getTrips } from "@/lib/content/load";

export const dynamic = "force-static";

/** Lists every public page. Drafts are already excluded by the content loader in production builds. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${getSite().domain}`;
  return [
    ...["/", "/work/", "/travel/", "/journal/"].map((p) => ({ url: base + p })),
    ...getTrips().map((t) => ({ url: `${base}/travel/${t.slug}/` })),
    ...getPosts().map((p) => ({ url: `${base}/journal/${p.slug}/`, lastModified: p.updatedAt ?? p.publishedAt })),
  ];
}

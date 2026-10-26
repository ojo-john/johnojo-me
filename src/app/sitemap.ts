import type { MetadataRoute } from "next";
import { getPosts, getSite, getTrips, journalIsOpen } from "@/lib/content/load";

export const dynamic = "force-static";

/** Lists every public page. Drafts are already excluded by the content loader in production builds. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${getSite().domain}`;
  const trips = getTrips();
  // A trip changes when its last photo was taken (or its dates); the travel pages change with the newest trip.
  const tripDate = (t: (typeof trips)[number]) =>
    t.visits.flatMap((v) => [...v.photos, ...v.videos].map((m) => m.takenAt?.slice(0, 10) ?? "")).concat(t.end ?? "", t.start ?? "").sort().at(-1) || undefined;
  const newest = trips.map(tripDate).filter(Boolean).sort().at(-1);
  return [
    ...["/", "/work/", "/travel/", "/resume/", ...(journalIsOpen() ? ["/journal/"] : [])].map((p) => ({ url: base + p, ...(p === "/" || p === "/travel/" ? { lastModified: newest } : {}) })),
    ...trips.map((t) => ({ url: `${base}/travel/${t.slug}/`, lastModified: tripDate(t) })),
    ...getPosts().map((p) => ({ url: `${base}/journal/${p.slug}/`, lastModified: p.updatedAt ?? p.publishedAt })),
  ];
}

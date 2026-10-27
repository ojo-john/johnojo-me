import type { MetadataRoute } from "next";
import { getPosts, getSite, getTrips, journalIsOpen } from "@/lib/content/load";

export const dynamic = "force-static";
/** How far past a trip's last day a photo's date may be and still count as the trip changing. */
const DATE_SLACK_MS = 7 * 24 * 3600 * 1000;

/** Lists every public page. Drafts are already excluded by the content loader in production builds. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${getSite().domain}`;
  const trips = getTrips();
  // A trip changes when its last photo was taken (or its dates); the travel pages change with the newest trip.
  // Files saved long after the trip (e.g. clips re-exported years later) carry the save date, so when a
  // trip has dates, only capture dates within a week of them count.
  const tripDate = (t: (typeof trips)[number]) => {
    const latest = t.end ?? t.start;
    const limit = latest ? new Date(Date.parse(latest.length === 7 ? `${latest}-28` : latest) + DATE_SLACK_MS).toISOString().slice(0, 10) : null;
    const taken = t.visits.flatMap((v) => [...v.photos, ...v.videos].map((m) => m.takenAt?.slice(0, 10) ?? "")).filter((d) => d && (!limit || d <= limit));
    return taken.concat(t.end ?? "", t.start ?? "").sort().at(-1) || undefined;
  };
  const newest = trips.map(tripDate).filter(Boolean).sort().at(-1);
  return [
    ...["/", "/work/", "/travel/", "/resume/", ...(journalIsOpen() ? ["/journal/"] : [])].map((p) => ({ url: base + p, ...(p === "/" || p === "/travel/" ? { lastModified: newest } : {}) })),
    ...trips.map((t) => ({ url: `${base}/travel/${t.slug}/`, lastModified: tripDate(t) })),
    ...(trips.some((t) => t.visits.some((v) => v.matches.length)) ? [{ url: `${base}/travel/match-days/`, lastModified: newest }] : []),
    ...getPosts().map((p) => ({ url: `${base}/journal/${p.slug}/`, lastModified: p.updatedAt ?? p.publishedAt })),
  ];
}

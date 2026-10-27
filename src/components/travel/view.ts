import "server-only";
import type { TripEntry, VisitEntry } from "@/lib/content/load";
import { CATEGORIES } from "@/lib/content/categories";
import { formatRange } from "@/lib/format";
import type { VisitView } from "./types";

/** Flatten a loaded visit into the plain data interactive components need. */
export function toView(v: VisitEntry, trip: TripEntry, number: number): VisitView {
  return {
    id: `${trip.slug}/${v.slug}`,
    slug: v.slug,
    tripSlug: trip.slug,
    tripTitle: trip.title,
    year: trip.year,
    order: v.order,
    number,
    city: v.place.city,
    country: v.place.country,
    destination: v.destination,
    kind: v.kind,
    dates: formatRange(v.arrive, v.depart),
    summary: v.summary ?? null,
    highlights: Object.entries(v.highlights ?? {}),
    liked: v.liked ?? null,
    disliked: v.disliked ?? null,
    wouldReturn: v.wouldReturn ?? null,
    verdict: v.verdict ?? null,
    notRanked: v.notRanked ?? null,
    score: v.score,
    scores: Object.fromEntries(CATEGORIES.map((c) => [c.key, v.rating?.scores[c.key] ?? null])),
    scoreNotes: Object.fromEntries(Object.entries(v.rating?.notes ?? {}).filter((e): e is [string, string] => Boolean(e[1]))),
    matches: v.matches,
    photos: v.photos,
    videos: v.videos,
    youtube: v.youtube,
    cover: v.coverPhoto,
  };
}

export const tripViews = (trip: TripEntry) => trip.visits.map((v, i) => toView(v, trip, i + 1));

/** Rankings only need names, dates and scores: drop media so the page payload stays small. */
export const slim = (v: VisitView): VisitView => ({ ...v, photos: [], videos: [], cover: null, youtube: [], matches: [] });

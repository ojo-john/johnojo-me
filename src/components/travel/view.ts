import "server-only";
import { hiddenOnSite, type TripEntry, type VisitEntry } from "@/lib/content/load";
import { CATEGORIES } from "@/lib/content/categories";
import { formatRange } from "@/lib/format";
import type { VisitView } from "./types";

/** "Fri 16 Oct". Dates are calendar days, so they're read in UTC to avoid shifting by a day. */
const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Flatten a loaded visit into the plain data interactive components need. */
export function toView(v: VisitEntry, trip: TripEntry, number: number): VisitView {
  const view = baseView(v, trip, number);
  const inMoments = new Set(view.moments.flatMap((m) => m.media.map((x) => x.id)));
  return { ...view, looseClips: view.videos.filter((c) => !inMoments.has(c.id)) };
}

function baseView(v: VisitEntry, trip: TripEntry, number: number): Omit<VisitView, "looseClips"> {
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
    hidden: hiddenOnSite(v.status, v.publishAt),
    dates: formatRange(v.arrive, v.depart),
    summary: v.summary ?? null,
    highlights: Object.entries(v.highlights ?? {}),
    liked: v.liked ?? null,
    disliked: v.disliked ?? null,
    wouldReturn: v.wouldReturn ?? null,
    verdict: v.verdict ?? null,
    notRanked: v.notRanked ?? null,
    moments: v.moments.map((m) => ({
      when: m.date ? dayLabel(m.date) : null,
      title: m.title,
      note: m.note ?? null,
      // Refs are visit-relative ("photos/img-0660"); only media the page actually shows are linked.
      media: m.media.map((ref) => [...v.photos, ...v.videos].find((x) => x.id.endsWith(`/${ref}`))).filter((x): x is NonNullable<typeof x> => Boolean(x)),
    })),
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
export const slim = (v: VisitView): VisitView => ({ ...v, photos: [], videos: [], cover: null, youtube: [], matches: [], moments: [], looseClips: [] });

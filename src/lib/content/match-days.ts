import type { MediaItem } from "./media";
import type { Match } from "./schema";

/** The slice of a loaded visit that a match day needs. */
export interface MatchVisit {
  slug: string;
  kind: "city" | "match-only" | "day-trip";
  place: { city: string; country: string };
  matches: Match[];
  moments: { title: string; media: string[] }[];
  photos: MediaItem[];
  videos: MediaItem[];
}

export interface MatchTrip {
  slug: string;
  title: string;
  visits: MatchVisit[];
}

export interface MatchDay extends Match {
  id: string;
  city: string;
  country: string;
  tripTitle: string;
  /** The stop on its trip page. */
  href: string;
  /** Photos and clips from the game itself, in the order they were shown on the trip. */
  media: MediaItem[];
}

const mentions = (text: string | null | undefined, names: string[]) => Boolean(text) && names.some((n) => (text as string).toLowerCase().includes(n.toLowerCase()));

/**
 * Which of a stop's photos and clips belong to this game:
 *   1. the "What I did" entry named after either team (Barcelona's "Espanyol v Atlético Madrid");
 *   2. otherwise, everything from a match-only stop (the whole visit was the game);
 *   3. otherwise, media whose caption or description names the stadium or a team (Munich's "Allianz Arena").
 */
export function matchMedia(visit: MatchVisit, match: Match): MediaItem[] {
  const all = [...visit.photos, ...visit.videos];
  const teams = [match.home, match.away];
  const moment = visit.moments.find((m) => mentions(m.title, teams));
  if (moment) return moment.media.map((ref) => all.find((x) => x.id.endsWith(`/${ref}`))).filter((x): x is MediaItem => Boolean(x));
  if (visit.kind === "match-only") return all;
  const names = [...teams, ...(match.stadium ? [match.stadium] : [])];
  return all.filter((x) => mentions(x.caption, names) || mentions(x.alt, names));
}

/** Every match on every trip, newest first; games without a date go last. */
export function matchDays(trips: MatchTrip[]): MatchDay[] {
  return trips
    .flatMap((t) =>
      t.visits.flatMap((v) =>
        v.matches.map((m, i) => ({
          ...m,
          id: `${t.slug}--${v.slug}--${i}`,
          city: v.place.city,
          country: v.place.country,
          tripTitle: t.title,
          href: `/travel/${t.slug}/#${v.slug}`,
          media: matchMedia(v, m),
        })),
      ),
    )
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** Headline numbers for the page. */
export function matchStats(days: MatchDay[]) {
  return {
    games: days.length,
    stadiums: new Set(days.map((d) => d.stadium ?? `${d.home}@${d.city}`)).size,
    countries: new Set(days.map((d) => d.country)).size,
  };
}

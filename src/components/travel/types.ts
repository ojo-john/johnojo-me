import type { MediaItem } from "@/lib/content/media";
import type { ScoreState } from "@/lib/content/ranking";
import type { Match } from "@/lib/content/schema";

/** Serializable view of a visit, passed from server pages to interactive travel components. */
export interface VisitView {
  id: string;
  slug: string;
  tripSlug: string;
  tripTitle: string;
  year: number;
  order: number;
  number: number;
  city: string;
  country: string;
  destination: string;
  kind: "city" | "match-only" | "day-trip";
  /** Preview site only: why this stop isn't public yet ("Hidden until 4 Nov 2026"); null when it is. */
  hidden: string | null;
  dates: string | null;
  summary: string | null;
  highlights: [string, string][];
  liked: string | null;
  disliked: string | null;
  wouldReturn: { answer: "yes" | "no" | "maybe"; why?: string } | null;
  verdict: string | null;
  notRanked: string | null;
  /** "What I did", day by day, each with its own media. */
  moments: { when: string | null; title: string; note: string | null; media: MediaItem[] }[];
  /** Clips not already shown under a moment. */
  looseClips: MediaItem[];
  score: ScoreState;
  scores: Record<string, number | null>;
  /** Context for individual scores, keyed like `scores`. */
  scoreNotes: Record<string, string>;
  matches: Match[];
  photos: MediaItem[];
  videos: MediaItem[];
  youtube: { id: string; title: string }[];
  cover: MediaItem | null;
}

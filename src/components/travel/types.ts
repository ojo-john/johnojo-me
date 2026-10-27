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
  dates: string | null;
  summary: string | null;
  highlights: [string, string][];
  liked: string | null;
  disliked: string | null;
  wouldReturn: { answer: "yes" | "no" | "maybe"; why?: string } | null;
  verdict: string | null;
  notRanked: string | null;
  score: ScoreState;
  scores: Record<string, number | null>;
  matches: Match[];
  photos: MediaItem[];
  videos: MediaItem[];
  youtube: { id: string; title: string }[];
  cover: MediaItem | null;
}

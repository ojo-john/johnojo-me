/**
 * What each stop still needs from John, for the admin dashboard's checklist. Works from the content
 * alone (no local notes folder), so it's the same on a laptop and on the live site.
 */
export type Need = "scores" | "would-return" | "notes" | "photos" | "match";

export interface NeedsInput {
  trip: string;
  tripTitle: string;
  tripPublished: boolean;
  visit: string;
  city: string;
  kind: "city" | "match-only" | "day-trip";
  hasSummary: boolean;
  scoresGiven: number;
  /** False for a stop deliberately kept out of the rankings (notRanked), which then needs no scores. */
  ranked: boolean;
  hasWouldReturn: boolean;
  photos: number;
  matches: number;
}

export interface NeedsItem {
  trip: string;
  tripTitle: string;
  visit: string;
  city: string;
  published: boolean;
  needs: Need[];
  /** Short human summary, e.g. "4 of 10 scores · would you return?". */
  detail: string;
}

const TOTAL_SCORES = 10;

export function needsFor(v: NeedsInput): Need[] {
  const out: Need[] = [];
  // Photos are what lets a draft go live. A published stop without any (Lisbon, Madrid) is deliberate.
  if (v.photos === 0 && !v.tripPublished) out.push("photos");
  if (!v.hasSummary && v.kind !== "match-only") out.push("notes");
  // Only full city stops are ranked; day trips, match days and stops marked "not ranked" aren't scored.
  if (v.kind === "city" && v.ranked && v.scoresGiven < TOTAL_SCORES) out.push("scores");
  if (v.kind === "city" && !v.hasWouldReturn) out.push("would-return");
  if (v.kind === "match-only" && v.matches === 0) out.push("match");
  return out;
}

const LABEL: Record<Need, (v: NeedsInput) => string> = {
  photos: () => "photos",
  notes: () => "a few lines of notes",
  scores: (v) => `${v.scoresGiven} of ${TOTAL_SCORES} scores`,
  "would-return": () => "would you return?",
  match: () => "match details",
};

/** Stops with something missing, published trips first (visitors see those), then newest trips. */
export function buildNeeds(inputs: NeedsInput[]): NeedsItem[] {
  return inputs
    .map((v) => ({ v, needs: needsFor(v) }))
    .filter(({ needs }) => needs.length > 0)
    .sort((a, b) => Number(b.v.tripPublished) - Number(a.v.tripPublished) || b.v.trip.localeCompare(a.v.trip) || a.v.visit.localeCompare(b.v.visit))
    .map(({ v, needs }) => ({
      trip: v.trip,
      tripTitle: v.tripTitle,
      visit: v.visit,
      city: v.city,
      published: v.tripPublished,
      needs,
      detail: needs.map((n) => LABEL[n](v)).join(" · "),
    }));
}

import { CATEGORIES, type CategoryKey, type Rating } from "./categories";

/**
 * Scorecard maths. Pure functions with no I/O so they can be unit-tested exhaustively.
 *
 * Rules (methodology v1):
 *  - Ten categories, 0–10 each, equal weights, total out of 100.
 *  - A total exists only when all ten categories are scored. Missing scores are never treated as zero.
 *  - Partially scored visits are "incomplete" and are excluded from ranked order.
 *  - Ties share a rank (standard competition ranking: 1, 1, 3).
 */

export const METHODOLOGY_VERSION = 1;

export type ScoreState =
  | { state: "unrated"; total: null; rated: 0 }
  | { state: "incomplete"; total: null; rated: number }
  | { state: "complete"; total: number; rated: 10 };

export function scoreState(rating: Rating | undefined): ScoreState {
  if (!rating) return { state: "unrated", total: null, rated: 0 };
  const values = CATEGORIES.map((c) => rating.scores[c.key]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return { state: "unrated", total: null, rated: 0 };
  if (values.length < CATEGORIES.length) return { state: "incomplete", total: null, rated: values.length };
  return { state: "complete", total: values.reduce((a, b) => a + b, 0), rated: 10 };
}

export function categoryScore(rating: Rating | undefined, key: CategoryKey): number | null {
  const v = rating?.scores[key];
  return typeof v === "number" ? v : null;
}

export interface Rankable {
  id: string;
  total: number | null;
}
export type Ranked<T> = T & { rank: number };

/** Rank items with a complete total, descending. Items without a total are returned separately, untouched. */
export function rank<T extends Rankable>(items: readonly T[]): { ranked: Ranked<T>[]; unranked: T[] } {
  const complete = items.filter((i) => i.total !== null).sort((a, b) => (b.total as number) - (a.total as number) || a.id.localeCompare(b.id));
  const ranked: Ranked<T>[] = [];
  complete.forEach((item, index) => {
    const prev = ranked[index - 1];
    const rankValue = prev && prev.total === item.total ? prev.rank : index + 1;
    ranked.push({ ...item, rank: rankValue });
  });
  return { ranked, unranked: items.filter((i) => i.total === null) };
}

export type Aggregation = "latest" | "best" | "average";
export const AGGREGATION_LABEL: Record<Aggregation, string> = {
  latest: "Latest visit",
  best: "Highest-rated visit",
  average: "Average of rated visits",
};

export interface VisitScore {
  visitId: string;
  date: string | null;
  total: number | null;
}

/** Collapse several visits to the same city into one score. Unrated visits are excluded, never counted as zero. */
export function aggregate(visits: readonly VisitScore[], mode: Aggregation): number | null {
  const rated = visits.filter((v) => v.total !== null) as (VisitScore & { total: number })[];
  if (rated.length === 0) return null;
  if (mode === "best") return Math.max(...rated.map((v) => v.total));
  if (mode === "average") return Math.round((rated.reduce((a, v) => a + v.total, 0) / rated.length) * 10) / 10;
  const sorted = [...rated].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return sorted[0].total;
}

/** Category-by-category change between two visits. A delta is null unless both visits scored that category. */
export function deltas(before: Rating | undefined, after: Rating | undefined): Record<CategoryKey, number | null> {
  return Object.fromEntries(
    CATEGORIES.map((c) => {
      const a = categoryScore(before, c.key);
      const b = categoryScore(after, c.key);
      return [c.key, a === null || b === null ? null : b - a];
    }),
  ) as Record<CategoryKey, number | null>;
}

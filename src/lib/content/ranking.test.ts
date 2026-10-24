import { describe, expect, it } from "vitest";
import { aggregate, deltas, rank, scoreState } from "./ranking";
import type { Rating } from "./schema";

const full = (n: number): Rating => ({
  scores: { food: n, value: n, transport: n, walkability: n, architecture: n, culture: n, people: n, attractions: n, safety: n, enjoyment: n },
});

describe("scoreState", () => {
  it("scoreState_noRating_isUnrated", () => {
    expect(scoreState(undefined)).toEqual({ state: "unrated", total: null, rated: 0 });
  });

  it("scoreState_allScoresNull_isUnratedNotZero", () => {
    const r: Rating = { scores: { food: null, value: null } };
    expect(scoreState(r)).toEqual({ state: "unrated", total: null, rated: 0 });
  });

  it("scoreState_someCategoriesMissing_isIncompleteWithoutTotal", () => {
    const r: Rating = { scores: { food: 9, value: 7, transport: 0 } };
    expect(scoreState(r)).toEqual({ state: "incomplete", total: null, rated: 3 });
  });

  it("scoreState_zeroIsARealScore_countsTowardCompletion", () => {
    const r = full(5);
    r.scores.safety = 0;
    expect(scoreState(r)).toEqual({ state: "complete", total: 45, rated: 10 });
  });

  it("scoreState_allTenScored_totalsOutOf100", () => {
    expect(scoreState(full(10))).toEqual({ state: "complete", total: 100, rated: 10 });
  });
});

describe("rank", () => {
  it("rank_emptyList_returnsNothing", () => {
    expect(rank([])).toEqual({ ranked: [], unranked: [] });
  });

  it("rank_ties_shareRankAndSkipNext", () => {
    const { ranked } = rank([
      { id: "a", total: 80 },
      { id: "b", total: 90 },
      { id: "c", total: 80 },
      { id: "d", total: 70 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });

  it("rank_unratedItems_areExcludedNotPlacedLast", () => {
    const { ranked, unranked } = rank([
      { id: "rated", total: 40 },
      { id: "unrated", total: null },
    ]);
    expect([ranked.map((r) => r.id), unranked.map((r) => r.id)]).toEqual([["rated"], ["unrated"]]);
  });
});

describe("aggregate", () => {
  const visits = [
    { visitId: "porto-2022", date: "2022-03-14", total: 72 },
    { visitId: "porto-2023", date: "2023-05-27", total: 81 },
    { visitId: "porto-2026", date: "2026-01-01", total: null },
  ];

  it("aggregate_latest_usesMostRecentRatedVisitIgnoringUnrated", () => {
    expect(aggregate(visits, "latest")).toBe(81);
  });

  it("aggregate_best_usesHighestTotal", () => {
    expect(aggregate([{ visitId: "x", date: "2024-01-01", total: 90 }, ...visits], "best")).toBe(90);
  });

  it("aggregate_average_excludesUnratedVisits", () => {
    expect(aggregate(visits, "average")).toBe(76.5);
  });

  it("aggregate_noRatedVisits_returnsNull", () => {
    expect(aggregate([{ visitId: "x", date: null, total: null }], "average")).toBeNull();
  });
});

describe("deltas", () => {
  it("deltas_categoryMissingOnEitherSide_isNull", () => {
    const before: Rating = { scores: { food: 6, transport: 8 } };
    const after: Rating = { scores: { food: 9 } };
    const d = deltas(before, after);
    expect([d.food, d.transport, d.safety]).toEqual([3, null, null]);
  });
});

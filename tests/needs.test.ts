import { describe, expect, it } from "vitest";
import { buildNeeds, needsFor, type NeedsInput } from "@/lib/content/needs";

const stop = (over: Partial<NeedsInput> = {}): NeedsInput => ({
  trip: "europe-2026", tripTitle: "Europe 2026", tripPublished: true, visit: "milan", city: "Milan", kind: "city",
  hasSummary: true, scoresGiven: 10, hasWouldReturn: true, photos: 5, matches: 0, ...over,
});

describe("needsFor", () => {
  it("needsFor_completeCity_needsNothing", () => {
    expect(needsFor(stop())).toEqual([]);
  });

  it("needsFor_newStop_needsEverything", () => {
    expect(needsFor(stop({ tripPublished: false, photos: 0, hasSummary: false, scoresGiven: 0, hasWouldReturn: false }))).toEqual(["photos", "notes", "scores", "would-return"]);
  });

  it("needsFor_publishedStopWithoutPhotos_isNotNagged", () => {
    expect(needsFor(stop({ photos: 0 }))).toEqual([]);
  });

  it("needsFor_dayTrip_isNeverAskedForScores", () => {
    expect(needsFor(stop({ kind: "day-trip", scoresGiven: 0, hasWouldReturn: false }))).toEqual([]);
  });

  it("needsFor_matchDayWithoutMatch_needsMatchDetailsNotNotes", () => {
    expect(needsFor(stop({ kind: "match-only", hasSummary: false, matches: 0 }))).toEqual(["match"]);
  });
});

describe("buildNeeds", () => {
  it("buildNeeds_nothingMissing_isEmpty", () => {
    expect(buildNeeds([stop()])).toEqual([]);
  });

  it("buildNeeds_publishedBeforeDraftsThenNewestTrip", () => {
    const items = buildNeeds([
      stop({ trip: "oregon-2026", tripPublished: false, photos: 0 }),
      stop({ trip: "europe-2021", visit: "paris", scoresGiven: 0 }),
      stop({ trip: "europe-2026", scoresGiven: 4 }),
    ]);
    expect(items.map((i) => i.trip)).toEqual(["europe-2026", "europe-2021", "oregon-2026"]);
  });

  it("buildNeeds_detail_readsNaturally", () => {
    expect(buildNeeds([stop({ scoresGiven: 4, hasWouldReturn: false })])[0].detail).toBe("4 of 10 scores · would you return?");
  });
});

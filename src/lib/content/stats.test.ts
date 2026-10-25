import { describe, expect, it } from "vitest";
import { travelStats } from "./stats";

const visit = (slug: string, country: string) => ({ place: { slug, country } });

describe("travelStats", () => {
  it("travelStats_noTrips_allZero", () => {
    expect(travelStats([])).toEqual({ trips: 0, places: 0, countries: 0 });
  });

  it("travelStats_placeVisitedOnTwoTrips_countedOnce", () => {
    const stats = travelStats([
      { kind: "trip", visits: [visit("porto", "Portugal")] },
      { kind: "trip", visits: [visit("porto", "Portugal"), visit("lisbon", "Portugal")] },
    ]);
    expect(stats).toEqual({ trips: 2, places: 2, countries: 1 });
  });

  it("travelStats_matchDay_countsPlaceAndCountryButNotTrip", () => {
    const stats = travelStats([
      { kind: "trip", visits: [visit("nice", "France")] },
      { kind: "match-day", visits: [visit("philadelphia", "United States")] },
    ]);
    expect(stats).toEqual({ trips: 1, places: 2, countries: 2 });
  });
});

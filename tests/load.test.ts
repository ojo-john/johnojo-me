import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIXTURES = path.resolve(__dirname, "fixtures/content");

/** Load the content module fresh with a given environment (drafts on/off). */
async function loadWith(env: { showDrafts: boolean }) {
  vi.resetModules();
  vi.stubEnv("CONTENT_DIR", FIXTURES);
  vi.stubEnv("NODE_ENV", env.showDrafts ? "development" : "production");
  vi.stubEnv("SHOW_DRAFTS", "");
  return import("@/lib/content/load");
}

describe("content loader", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("getTrips_productionBuild_hidesDraftTripsAndDraftVisits", async () => {
    const { getTrips } = await loadWith({ showDrafts: false });
    const trips = getTrips();
    expect([trips.map((t) => t.slug), trips.find((t) => t.slug === "trip-b")?.visits.map((v) => v.slug)]).toEqual([["trip-b", "trip-a"], ["porto"]]);
  });

  it("getTrips_devBuild_includesDrafts", async () => {
    const { getTrips } = await loadWith({ showDrafts: true });
    expect(getTrips().map((t) => t.slug)).toContain("hidden");
  });

  it("visit_partialRating_isIncompleteNotZero", async () => {
    const { getTrip } = await loadWith({ showDrafts: false });
    const region = getTrip("trip-a")?.visits.find((v) => v.slug === "region");
    expect(region?.score).toEqual({ state: "incomplete", total: null, rated: 1 });
  });

  it("visit_fullRating_totalsOutOf100", async () => {
    const { getTrip } = await loadWith({ showDrafts: false });
    expect(getTrip("trip-a")?.visits[0].score.total).toBe(83);
  });

  it("visitsTo_sameCityTwoTrips_keepsVisitsSeparate", async () => {
    const { visitsTo } = await loadWith({ showDrafts: false });
    const porto = visitsTo("porto");
    expect(porto.map((v) => [v.tripSlug, v.score.state])).toEqual([
      ["trip-a", "complete"],
      ["trip-b", "unrated"],
    ]);
  });

  it("destination_withoutCoordinates_stillLoads", async () => {
    const { getTrip } = await loadWith({ showDrafts: false });
    expect(getTrip("trip-a")?.visits.find((v) => v.slug === "region")?.place.lat).toBeUndefined();
  });

  it("getPosts_productionBuild_onlyPublicPublishedPosts", async () => {
    const { getPosts } = await loadWith({ showDrafts: false });
    expect(getPosts().map((p) => p.slug)).toEqual(["public"]);
  });
});

describe("editor list formats", () => {
  it("visit_highlightsSavedAsList_normalisedToMap", async () => {
    vi.resetModules();
    vi.stubEnv("CONTENT_DIR", FIXTURES);
    vi.stubEnv("NODE_ENV", "development");
    const { getTrip } = await import("@/lib/content/load");
    const porto = getTrip("trip-b")?.visits.find((v) => v.slug === "porto");
    expect([porto?.highlights, porto?.mediaMeta]).toEqual([{ Food: "Bifana" }, { "photos/a": { caption: "Hi" } }]);
  });
});

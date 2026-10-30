import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIXTURES = path.resolve(__dirname, "fixtures/content");

/** Load the content module fresh with a given environment (drafts on/off, dev server or real build). */
async function loadWith(env: { showDrafts: boolean; nodeEnv?: "development" | "production"; today?: string }) {
  vi.resetModules();
  // A fixed "today" keeps the scheduled fixtures (publish date 2027-01-15) independent of the real date.
  vi.stubEnv("CONTENT_TODAY", env.today ?? "2026-10-30");
  vi.stubEnv("CONTENT_DIR", FIXTURES);
  vi.stubEnv("NODE_ENV", env.nodeEnv ?? "production");
  vi.stubEnv("SHOW_DRAFTS", env.showDrafts ? "1" : "");
  return import("@/lib/content/load");
}

describe("content loader", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("getTrips_productionBuild_hidesDraftTripsAndDraftVisits", async () => {
    const { getTrips } = await loadWith({ showDrafts: false });
    const trips = getTrips();
    expect([trips.map((t) => t.slug), trips.find((t) => t.slug === "trip-b")?.visits.map((v) => v.slug)]).toEqual([["trip-b", "trip-a"], ["porto"]]);
  });

  it("getTrips_showDraftsFlag_includesDrafts", async () => {
    const { getTrips } = await loadWith({ showDrafts: true });
    expect(getTrips().map((t) => t.slug)).toContain("hidden");
  });

  it("getTrips_plainDevServer_hidesDraftsLikeLiveSite", async () => {
    const { getTrips } = await loadWith({ showDrafts: false, nodeEnv: "development" });
    expect(getTrips().map((t) => t.slug)).not.toContain("hidden");
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

  it("getTrips_publishDateInFuture_hidesTrip", async () => {
    const { getTrips } = await loadWith({ showDrafts: false });
    expect(getTrips().map((t) => t.slug)).not.toContain("scheduled");
  });

  it("getTrips_publishDateToday_showsTrip", async () => {
    const { getTrips } = await loadWith({ showDrafts: false, today: "2027-01-15" });
    expect(getTrips().map((t) => t.slug)).toContain("scheduled");
  });

  it("getTrips_showDraftsFlag_previewsScheduledTrip", async () => {
    const { getTrips } = await loadWith({ showDrafts: true });
    expect(getTrips().map((t) => t.slug)).toContain("scheduled");
  });

  it("getPosts_publishedAtInFuture_hidesPost", async () => {
    const { getPosts } = await loadWith({ showDrafts: false });
    expect(getPosts().map((p) => p.slug)).not.toContain("scheduled");
  });

  it("getPosts_publishedAtReached_showsPost", async () => {
    const { getPosts } = await loadWith({ showDrafts: false, today: "2027-01-16" });
    expect(getPosts().map((p) => p.slug)).toContain("scheduled");
  });

  it("getExperience_jobScheduled_hiddenUntilItsDay", async () => {
    const { getExperience } = await loadWith({ showDrafts: false });
    const e = getExperience();
    expect([e.roles.map((r) => r.title), e.milestones.map((m) => m.title)]).toEqual([["Engineer"], ["Joined"]]);
  });

  it("getExperience_jobScheduledDayArrives_shown", async () => {
    const { getExperience } = await loadWith({ showDrafts: false, today: "2027-01-15" });
    expect(getExperience().roles.map((r) => r.title)).toEqual(["Engineer", "Senior engineer"]);
  });

  it("getAdminDashboard_scheduledTrip_reportsItsDate", async () => {
    const { getAdminDashboard } = await loadWith({ showDrafts: false });
    expect(getAdminDashboard().trips.find((t) => t.slug === "scheduled")?.scheduled).toBe("2027-01-15");
  });
});

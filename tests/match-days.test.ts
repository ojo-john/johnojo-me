import { describe, expect, it } from "vitest";
import type { MediaItem } from "../src/lib/content/media";
import { matchDays, matchMedia, matchStats, type MatchVisit } from "../src/lib/content/match-days";

const photo = (id: string, caption?: string): MediaItem => ({ type: "photo", id, caption, alt: caption ?? "", w: 4, h: 3, placeholder: "", variants: [] }) as unknown as MediaItem;
const visit = (over: Partial<MatchVisit> = {}): MatchVisit => ({
  slug: "barcelona",
  kind: "city",
  place: { city: "Barcelona", country: "Spain" },
  matches: [{ home: "Espanyol", away: "Atlético Madrid", score: "0–1", stadium: "RCDE Stadium", date: "2026-10-17" }],
  moments: [],
  photos: [photo("e/b/photos/img-1", "Park Güell"), photo("e/b/photos/img-2", "Espanyol v Atlético Madrid")],
  videos: [],
  ...over,
});
const game = visit().matches[0];

describe("matchMedia", () => {
  it("matchMedia_momentNamedAfterATeam_usesThatMomentsMedia", () => {
    const v = visit({ moments: [{ title: "Park Güell", media: ["photos/img-1"] }, { title: "Espanyol v Atlético Madrid", media: ["photos/img-1", "photos/img-2"] }] });
    expect(matchMedia(v, game).map((m) => m.id)).toEqual(["e/b/photos/img-1", "e/b/photos/img-2"]);
  });

  it("matchMedia_momentRefToHiddenPhoto_isSkipped", () => {
    const v = visit({ moments: [{ title: "Espanyol game", media: ["photos/img-9", "photos/img-2"] }] });
    expect(matchMedia(v, game).map((m) => m.id)).toEqual(["e/b/photos/img-2"]);
  });

  it("matchMedia_matchOnlyStop_usesEverything", () => {
    expect(matchMedia(visit({ kind: "match-only" }), game)).toHaveLength(2);
  });

  it("matchMedia_cityStopWithoutMoment_usesCaptionsNamingTheGame", () => {
    expect(matchMedia(visit(), game).map((m) => m.caption)).toEqual(["Espanyol v Atlético Madrid"]);
  });

  it("matchMedia_captionMatchingIsCaseInsensitiveAndUsesStadium", () => {
    const v = visit({ photos: [photo("x/photos/a", "outside the rcde stadium")] });
    expect(matchMedia(v, game)).toHaveLength(1);
  });

  it("matchMedia_nothingAboutTheGame_isEmpty", () => {
    expect(matchMedia(visit({ photos: [photo("x/photos/a", "Sagrada Família")] }), game)).toEqual([]);
  });
});

describe("matchDays", () => {
  const trips = [
    { slug: "europe-2024", title: "Europe 2024", visits: [visit({ slug: "munich", place: { city: "Munich", country: "Germany" }, matches: [{ home: "Bayern Munich", away: "Arsenal", date: "2024-04-17" }] })] },
    { slug: "europe-2026", title: "Europe 2026", visits: [visit(), visit({ slug: "rome", place: { city: "Rome", country: "Italy" }, matches: [{ home: "Roma", away: "Cagliari" }] })] },
  ];

  it("matchDays_severalTrips_newestFirstUndatedLast", () => {
    expect(matchDays(trips).map((d) => d.home)).toEqual(["Espanyol", "Bayern Munich", "Roma"]);
  });

  it("matchDays_eachGame_linksToItsStop", () => {
    expect(matchDays(trips)[0].href).toBe("/travel/europe-2026/#barcelona");
  });

  it("matchDays_noMatches_isEmpty", () => {
    expect(matchDays([{ slug: "aruba", title: "Aruba", visits: [visit({ matches: [] })] }])).toEqual([]);
  });
});

describe("matchStats", () => {
  it("matchStats_twoGamesSameStadium_countsStadiumOnce", () => {
    const days = matchDays([{ slug: "t", title: "T", visits: [visit({ matches: [game, { ...game, date: "2026-10-18" }] })] }]);
    expect(matchStats(days)).toEqual({ games: 2, stadiums: 1, countries: 1 });
  });
});

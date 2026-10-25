/** Inputs the travel stats need; a structural subset of TripEntry so tests can pass plain objects. */
interface StatsTrip {
  kind: "trip" | "match-day";
  visits: { place: { slug: string; country: string } }[];
}

/**
 * The "N trips · N places · N countries" line, computed from published content. Match days count
 * toward places and countries (I was there) but not toward trips. A place visited twice counts once.
 */
export function travelStats(trips: StatsTrip[]): { trips: number; places: number; countries: number } {
  const places = new Map(trips.flatMap((t) => t.visits).map((v) => [v.place.slug, v.place.country]));
  return { trips: trips.filter((t) => t.kind === "trip").length, places: places.size, countries: new Set(places.values()).size };
}

/**
 * The ten scorecard categories, in display order. Keys are stable; labels can change freely.
 * Kept free of zod so interactive components can import it without shipping the schema library.
 */
export const CATEGORIES = [
  { key: "food", label: "Food & Desserts" },
  { key: "value", label: "Affordability & Value" },
  { key: "transport", label: "Public Transport (buses, trains, trams)" },
  { key: "walkability", label: "Walkability" },
  { key: "architecture", label: "Architecture & Beauty" },
  { key: "culture", label: "Culture & Atmosphere" },
  { key: "people", label: "People & Hospitality" },
  { key: "attractions", label: "Attractions & Experiences" },
  { key: "safety", label: "Safety & Comfort" },
  { key: "enjoyment", label: "Overall Enjoyment" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** Shape of a visit's scores (mirrors the zod schema in schema.ts). */
export interface Rating {
  ratedOn?: string;
  scores: Partial<Record<CategoryKey, number | null>>;
  notes?: Partial<Record<CategoryKey, string>>;
  tieBreakNote?: string;
}

import { z } from "zod";

/**
 * Content schemas. Every file under /content is validated against these at build time, so a typo
 * fails the build instead of shipping a broken page. Optional fields are genuinely optional: the UI
 * renders an honest empty state ("Not yet rated", "Notes coming") rather than inventing content.
 */

/** YAML turns unquoted dates into Date objects; accept both and normalise to YYYY-MM-DD / YYYY-MM. */
const isoDate = z
  .union([z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "use YYYY-MM-DD or YYYY-MM"), z.date()])
  .transform((v) => (typeof v === "string" ? v : v.toISOString().slice(0, 10)));

/** Accept either a YAML map or the list form the editor writes ([{ label, text }]) and return a map. */
const mapOrList = <V extends z.ZodType>(value: V, keyName: string, valueName?: string) =>
  z.preprocess((input) => {
    if (!Array.isArray(input)) return input;
    return Object.fromEntries(
      input
        .filter((row) => row && typeof row === "object" && (row as Record<string, unknown>)[keyName])
        .map((row) => {
          const r = row as Record<string, unknown>;
          if (valueName) return [r[keyName], r[valueName]];
          const { [keyName]: k, ...rest } = r;
          return [k, rest];
        }),
    );
  }, z.record(z.string(), value));

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, numbers and hyphens only");

const yearMonth = z.preprocess((v) => (v instanceof Date ? v.toISOString().slice(0, 7) : v), z.string().regex(/^\d{4}-\d{2}$/, "use YYYY-MM"));

export const STATUS = ["draft", "coming-soon", "published"] as const;
export const status = z.enum(STATUS);
export type Status = z.infer<typeof status>;

import { CATEGORIES, type CategoryKey } from "./categories";
export { CATEGORIES, type CategoryKey };

const score = z.number().int().min(0).max(10).nullable();
export const rating = z.object({
  ratedOn: isoDate.optional(),
  /** No scores yet is the same as "not rated"; the editor leaves the block out when every score is blank. */
  scores: z.object(Object.fromEntries(CATEGORIES.map((c) => [c.key, score.optional()])) as Record<CategoryKey, z.ZodOptional<typeof score>>).default({}),
  notes: z.record(z.string(), z.string()).optional(),
  tieBreakNote: z.string().optional(),
});
export type Rating = z.infer<typeof rating>;

/** Manual crop choices, top to bottom; each maps to a vertical position in FOCUS_Y. */
export const FOCUS_BANDS = ["top", "upper", "centre", "lower", "bottom"] as const;
export const FOCUS_Y: Record<(typeof FOCUS_BANDS)[number], number> = { top: 0, upper: 25, centre: 50, lower: 75, bottom: 100 };

/** The point to keep in view when the cover is cropped, set by clicking in the editor: "62% 30%" (across, down). */
const coverFocus = z.string().regex(/^(100|\d{1,2})% (100|\d{1,2})%$/, 'two percentages, e.g. "62% 30%"');
export const parseFocus = (s: string | undefined) => {
  const m = s?.match(/^(\d+)% (\d+)%$/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};

export const mediaMeta = z.object({
  caption: z.string().optional(),
  alt: z.string().optional(),
  hidden: z.boolean().optional(),
  /** Clockwise turn for a photo whose camera didn't record which way up it was. Applied by npm run media. */
  rotate: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional(),
  /** Which part to keep when a cover or thumbnail crops this photo, if the automatic choice misses. */
  focus: z.enum(FOCUS_BANDS).optional(),
});

export const match = z.object({
  home: z.string(),
  away: z.string(),
  competition: z.string().optional(),
  score: z.string().optional(),
  stadium: z.string().optional(),
  date: isoDate.optional(),
  writeUp: z.string().optional(),
});
export type Match = z.infer<typeof match>;

export const visit = z.object({
  /** Trip this visit belongs to (folder name under content/trips). */
  trip: slug,
  destination: slug,
  /** Folder name in the media inbox, when it differs from the visit name (e.g. "nice + french riviera"). */
  photoFolder: z.string().optional(),
  order: z.number().int().min(1),
  kind: z.enum(["city", "match-only", "day-trip"]).default("city"),
  status: status.default("published"),
  arrive: isoDate.optional(),
  depart: isoDate.optional(),
  summary: z.string().optional(),
  highlights: mapOrList(z.string(), "label", "text").optional(),
  liked: z.string().optional(),
  disliked: z.string().optional(),
  wouldReturn: z.object({ answer: z.enum(["yes", "no", "maybe"]), why: z.string().optional() }).optional(),
  verdict: z.string().optional(),
  /** Set when a stop is deliberately left unscored (e.g. "I barely saw the city"): kept out of the rankings, with this as the reason. */
  notRanked: z.string().optional(),
  rating: rating.optional(),
  matches: z.array(match).default([]),
  /** Ordered media ids ("photos/IMG_1234"). Omit to show every processed photo for this city by date. */
  media: z.array(z.string()).optional(),
  mediaMeta: mapOrList(mediaMeta, "file").default({}),
  cover: z.string().optional(),
  coverFocus: coverFocus.optional(),
  /** Rotate/crop lines from the editor's photo tool; see photo-edits.ts. Applied by npm run media. */
  photoEdits: z.string().optional(),
  youtube: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
});
export type Visit = z.infer<typeof visit>;

export const trip = z.object({
  title: z.string(),
  /** "match-day" = a one-off game rather than a trip: listed under Match days and on the map, not as a trip card. */
  kind: z.enum(["trip", "match-day"]).default("trip"),
  year: z.number().int(),
  status: status,
  start: isoDate.optional(),
  end: isoDate.optional(),
  datesNote: z.string().optional(),
  style: z.string().optional(),
  theme: z.string().optional(),
  intro: z.string().optional(),
  cover: z.string().optional(),
  coverFocus: coverFocus.optional(),
  awards: z.array(z.object({ award: z.string(), visit: slug.optional() })).default([]),
  verdict: z
    .object({
      bestMoment: z.string().optional(),
      biggestSurprise: z.string().optional(),
      wouldChange: z.string().optional(),
      favouriteCity: z.string().optional(),
      wouldRepeat: z.string().optional(),
    })
    .default({}),
});
export type Trip = z.infer<typeof trip>;

export const destination = z.object({
  city: z.string(),
  country: z.string(),
  /** Only verified coordinates. A destination without them still renders; it just has no map pin. */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export const destinations = z.record(slug, destination);
export type Destination = z.infer<typeof destination>;

export const site = z.object({
  name: z.string(),
  role: z.string(),
  company: z.string(),
  level: z.string().optional(),
  intro: z.string(),
  /** The home page's search-result snippet (aim for 120–160 characters). Falls back to the intro. */
  seoDescription: z.string().optional(),
  github: z.string().url(),
  /** Null or left out (the editor leaves blank fields out) both mean "not shown". */
  linkedin: z.string().url().nullable().default(null),
  email: z.string().email().nullable().default(null),
  /** Path under /public, e.g. "/resume.pdf". Null until an approved résumé exists. */
  resume: z.string().nullable().default(null),
  /** City shown on the résumé page. Never a street address. */
  location: z.string().nullable().default(null),
  domain: z.string(),
});
export type Site = z.infer<typeof site>;

export const experience = z.object({
  milestones: z.array(
    z.object({ date: isoDate, label: z.string(), title: z.string(), detail: z.string(), body: z.string().optional() }),
  ),
  achievementsNote: z.string(),
  roles: z
    .array(
      z.object({
        title: z.string(),
        org: z.string(),
        dates: z.string(),
        location: z.string().optional(),
        note: z.string().optional(),
        sections: z
          .array(
            z.object({
              title: z.string(),
              dates: z.string().optional(),
              /** YYYY-MM. Lets the Work page show what I worked on in a given year; no end means ongoing. */
              start: yearMonth.optional(),
              end: yearMonth.optional(),
              bullets: z.array(z.string()),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  education: z.array(z.object({ school: z.string(), degree: z.string(), years: z.string() })).default([]),
  skills: mapOrList(z.array(z.string()), "group", "items"),
  /** The few tags shown on the home page Work panel. The full list stays on /work/ and the résumé. */
  featuredSkills: z.array(z.string()).default([]),
});
export type Experience = z.infer<typeof experience>;

export const project = z.object({
  name: z.string(),
  order: z.number().int(),
  status: status,
  kind: z.enum(["case-study", "project"]),
  stage: z.string(),
  summary: z.string(),
  problem: z.string(),
  approach: z.string(),
  stack: z.array(z.string()),
  repo: z.string().url().nullable().default(null),
  repoNote: z.string().optional(),
  demo: z.string().url().nullable().default(null),
  /** Shown next to the live link, e.g. "Sign-in required". */
  demoNote: z.string().optional(),
  diagram: z.array(z.object({ label: z.string(), note: z.string() })).default([]),
});
export type Project = z.infer<typeof project>;

export const VISIBILITY = ["public", "free", "paid", "private"] as const;
/** Journal categories, in the order the site lists them. */
export const POST_CATEGORIES = ["Bible Study", "Faith", "Life Lessons", "Essays", "Engineering", "Travel Reflections"] as const;
export const post = z.object({
  title: z.string(),
  dek: z.string(),
  category: z.enum(POST_CATEGORIES),
  series: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: status,
  /** Only "public" ships in V1. The other tiers exist so later versions don't need a content migration. */
  visibility: z.enum(VISIBILITY).default("public"),
  publishedAt: isoDate.optional(),
  updatedAt: isoDate.optional(),
  cover: z.string().optional(),
  coverAlt: z.string().optional(),
  sample: z.boolean().default(false),
  footnotes: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
});
export type PostFrontmatter = z.infer<typeof post>;

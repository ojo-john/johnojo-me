/**
 * Writing help for the editor: photo captions and polished notes, drafted by Claude for John to review.
 * This file holds the prompts and the checks on what comes back; it makes no network calls, so it's fully
 * unit-tested. src/lib/assist/claude.ts sends the requests.
 */
import { z } from "zod";

/** Default model for both jobs; override with ASSIST_MODEL. */
export const DEFAULT_MODEL = "claude-opus-5-5";
export const LIMITS = { caption: 70, alt: 180, noteChars: 4000 } as const;

/** Words and habits that make writing read as machine-written. Shared by both prompts and checked after. */
const AVOID = ["nestled", "vibrant", "testament", "delve", "tapestry", "bustling", "breathtaking", "iconic", "hidden gem", "stunning", "a must-see", "embark", "unforgettable"];

const HOUSE_STYLE = `House style for johnojo.me, John Ojo's personal travel site:
- Plain, warm, specific. Short sentences. No hype.
- Never use these words or phrases: ${AVOID.join(", ")}.
- No em dashes. No exclamation marks unless John wrote one.
- Keep the spelling John uses (he mixes "centre" and "center"; don't change either way).`;

export const CAPTION_SYSTEM = `You write photo captions for a personal travel site.
${HOUSE_STYLE}

For each photo you get the trip, the city, the date, what John was doing that day if known, and a few existing captions from the same stop as examples of tone.
Return:
- caption: at most ${LIMITS.caption} characters. A short label, like "Lake St. Moritz" or "Full time: Roma 4–2 Cagliari". Name a landmark, dish or stadium only when you're confident from the image and the context; otherwise describe what's there.
- alt: at most ${LIMITS.alt} characters. One sentence describing what's in the photo for someone who can't see it.
People:
- Never guess anyone's name. Only famous public figures on signs, screens or shirts may be named, and only when the name is readable.
- If the photo is clearly a selfie (arm's-length framing of the person holding the camera), that person is John; call him John.
- Other people are "a friend", "friends", "a waiter" and so on. Never describe bodies, attractiveness, race or age.
- Don't mention private details you can read in the photo: addresses, booking numbers, names on documents.`;

export const POLISH_SYSTEM = `You edit John Ojo's travel notes for his personal site.
${HOUSE_STYLE}

Fix spelling, grammar and punctuation, and make the writing a little clearer and tighter. It must still sound like John: first person, his opinions, his words where they work.
- Never add facts, places, feelings or opinions he didn't write. Never remove one.
- Keep roughly the same length (shorter is fine).
- If he made a factual slip that's plainly wrong (for example calling Amalfi an island), fix it quietly and say so in "changes".
Return the edited text, and "changes": up to five short notes on what you changed, in plain words.`;

/** The fields the editor can polish, and how each is used on the site, so the edit fits its spot. */
export const POLISH_FIELDS = {
  summary: "the 'What I did' paragraph for a stop (60–150 words)",
  liked: "a one- or two-sentence 'Liked' line",
  disliked: "a one- or two-sentence 'Didn't like' line",
  why: "the reason under 'Would I go back?', one sentence",
  verdict: "a one-line verdict",
  note: "a short note under one thing he did",
  writeUp: "a short match report",
  intro: "a trip introduction, two or three sentences",
} as const;
export type PolishField = keyof typeof POLISH_FIELDS;

export const captionResult = z.object({ caption: z.string().min(1).max(LIMITS.caption), alt: z.string().min(1).max(LIMITS.alt) });
export type CaptionResult = z.infer<typeof captionResult>;
export const polishResult = z.object({ text: z.string().min(1), changes: z.array(z.string()).max(5) });
export type PolishResult = z.infer<typeof polishResult>;

/** JSON Schemas for the API's structured output (output_config.format), matching the zod checks above. */
export const CAPTION_SCHEMA = {
  type: "object",
  properties: { caption: { type: "string" }, alt: { type: "string" } },
  required: ["caption", "alt"],
  additionalProperties: false,
} as const;
export const POLISH_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" }, changes: { type: "array", items: { type: "string" } } },
  required: ["text", "changes"],
  additionalProperties: false,
} as const;

export interface CaptionContext {
  trip: string;
  city: string;
  country?: string;
  /** When the photo was taken, YYYY-MM-DD. */
  date?: string;
  /** Titles and notes of what John did that day ("Trastevere food tour"). */
  activities: string[];
  /** A few existing captions from the same stop, for tone. */
  examples: { caption: string; alt: string }[];
  kind: "photo" | "video";
}

/** The text that goes next to the image. Untrusted strings are quoted, never treated as instructions. */
export function captionPrompt(c: CaptionContext): string {
  const lines = [
    `Trip: ${JSON.stringify(c.trip)}`,
    `Place: ${JSON.stringify([c.city, c.country].filter(Boolean).join(", "))}`,
    c.date ? `Taken: ${c.date}` : "",
    c.activities.length ? `What John did that day: ${c.activities.map((a) => JSON.stringify(a)).join("; ")}` : "",
    c.examples.length ? `Captions already on this stop:\n${c.examples.map((e) => `- ${JSON.stringify(e.caption)} / ${JSON.stringify(e.alt)}`).join("\n")}` : "",
    c.kind === "video" ? "This is a still frame from a short video clip; caption the clip." : "",
    "Write the caption and alt text for this image.",
  ];
  return lines.filter(Boolean).join("\n");
}

export function polishPrompt(text: string, field: PolishField, place?: string): string {
  return [`This is ${POLISH_FIELDS[field]}${place ? ` for ${JSON.stringify(place)}` : ""}.`, "Edit this text:", "<notes>", text, "</notes>"].join("\n");
}

/** Words from the avoid list that slipped through anyway, so the caller can reject or flag the draft. */
export function bannedWords(text: string): string[] {
  const lower = text.toLowerCase();
  return AVOID.filter((w) => lower.includes(w)).concat(text.includes("—") ? ["em dash"] : []);
}

/**
 * Recipe posts: the times shown on the card, and the schema.org Recipe data that lets search engines show
 * cooking time and ingredients in results. https://developers.google.com/search/docs/appearance/structured-data/recipe
 */
import type { Recipe } from "./schema";

/** ISO 8601 duration for schema.org, e.g. 90 → "PT1H30M". Undefined when there's no time. */
export function isoDuration(minutes: number | undefined): string | undefined {
  if (minutes === undefined) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h ? `${h}H` : ""}${m || !h ? `${m}M` : ""}`;
}

/** Short label for the card, e.g. 90 → "1 hr 30 min". */
export function timeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : "", m || !h ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** Prep plus cook, when either is known. */
export function totalMinutes(r: Recipe): number | undefined {
  return r.prepMinutes === undefined && r.cookMinutes === undefined ? undefined : (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
}

export function recipeJsonLd(post: { title: string; dek: string; publishedAt?: string; recipe: Recipe }, author: string, url: string, image?: string) {
  const r = post.recipe;
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: post.title,
    description: post.dek,
    author: { "@type": "Person", name: author },
    url,
    ...(image ? { image: [image] } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    ...(r.servings ? { recipeYield: r.servings } : {}),
    ...(r.cuisine ? { recipeCuisine: r.cuisine } : {}),
    ...(r.prepMinutes !== undefined ? { prepTime: isoDuration(r.prepMinutes) } : {}),
    ...(r.cookMinutes !== undefined ? { cookTime: isoDuration(r.cookMinutes) } : {}),
    ...(totalMinutes(r) !== undefined ? { totalTime: isoDuration(totalMinutes(r)) } : {}),
    recipeIngredient: r.ingredients,
    recipeInstructions: r.steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
  };
}

import { POST_CATEGORIES } from "./schema";

/** The journal categories that at least one of these posts uses, in the site's order, so no filter or tag leads nowhere. */
export function usedCategories(posts: readonly { category: string }[]): string[] {
  const used = new Set(posts.map((p) => p.category));
  return POST_CATEGORIES.filter((c) => used.has(c));
}

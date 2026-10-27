import { getPosts, getSite } from "@/lib/content/load";
import { buildFeed } from "@/lib/feed";

export const dynamic = "force-static";

/** /journal/feed.xml: public posts only. Drafts, samples and undated posts never reach a feed reader. */
export function GET() {
  const site = getSite();
  const items = getPosts()
    .filter((p) => p.status === "published" && p.visibility === "public" && !p.sample && p.publishedAt)
    .map((p) => ({ slug: p.slug, title: p.title, dek: p.dek, category: p.category, publishedAt: p.publishedAt as string }));
  const xml = buildFeed({ domain: site.domain, title: `${site.name} · Journal`, description: "Bible studies, faith, life lessons, essays and engineering notes.", items });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}

/** RSS 2.0 for the journal, so people can follow new posts in a feed reader. */

export interface FeedItem {
  slug: string;
  title: string;
  dek: string;
  category: string;
  /** ISO date, "2026-03-01". */
  publishedAt: string;
}

/** Only the newest posts go in the feed; readers keep their own history. */
export const FEED_LIMIT = 20;

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const rfc822 = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toUTCString();

export function buildFeed({ domain, title, description, items }: { domain: string; title: string; description: string; items: FeedItem[] }): string {
  const base = `https://${domain}`;
  const newest = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, FEED_LIMIT);
  const entries = newest.map((p) => {
    const url = `${base}/journal/${p.slug}/`;
    return [
      "    <item>",
      `      <title>${escapeXml(p.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <description>${escapeXml(p.dek)}</description>`,
      `      <category>${escapeXml(p.category)}</category>`,
      `      <pubDate>${rfc822(p.publishedAt)}</pubDate>`,
      "    </item>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${base}/journal/</link>`,
    `    <description>${escapeXml(description)}</description>`,
    "    <language>en</language>",
    `    <atom:link href="${base}/journal/feed.xml" rel="self" type="application/rss+xml" />`,
    ...(newest[0] ? [`    <lastBuildDate>${rfc822(newest[0].publishedAt)}</lastBuildDate>`] : []),
    ...entries,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

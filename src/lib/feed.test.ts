import { describe, expect, it } from "vitest";
import { buildFeed, FEED_LIMIT, type FeedItem } from "./feed";

const item = (over: Partial<FeedItem> = {}): FeedItem => ({ slug: "hebrews-11", title: "Not knowing", dek: "A study.", category: "Bible Study", publishedAt: "2026-03-01", ...over });
const feed = (items: FeedItem[]) => buildFeed({ domain: "johnojo.me", title: "John Ojo · Journal", description: "Notes", items });

describe("buildFeed", () => {
  it("buildFeed_noPosts_isValidEmptyChannel", () => {
    const xml = feed([]);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  it("buildFeed_markupInTitleAndDek_isEscaped", () => {
    const xml = feed([item({ title: "Faith & <doubt>", dek: `"Ask" 'why'` })]);
    expect(xml).toContain("<title>Faith &amp; &lt;doubt&gt;</title>");
    expect(xml).toContain("<description>&quot;Ask&quot; &apos;why&apos;</description>");
  });

  it("buildFeed_post_linksToItsAbsolutePageAndRfc822Date", () => {
    const xml = feed([item()]);
    expect(xml).toContain("<link>https://johnojo.me/journal/hebrews-11/</link>");
    expect(xml).toContain("<pubDate>Sun, 01 Mar 2026 00:00:00 GMT</pubDate>");
  });

  it("buildFeed_morePostsThanLimit_keepsNewestFirst", () => {
    const items = Array.from({ length: FEED_LIMIT + 5 }, (_, i) => item({ slug: `p${i}`, publishedAt: `2026-01-${String(i + 1).padStart(2, "0")}` }));
    const xml = feed(items);
    expect(xml.match(/<item>/g)).toHaveLength(FEED_LIMIT);
    expect(xml.indexOf("/journal/p24/")).toBeLessThan(xml.indexOf("/journal/p23/"));
    expect(xml).not.toContain("/journal/p4/");
  });
});

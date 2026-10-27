import { describe, expect, it } from "vitest";
import { changedUrls, parseSitemap } from "../scripts/lib/sitemap-diff";

const xml = (entries: [string, string?][]) =>
  `<?xml version="1.0"?><urlset>${entries.map(([l, m]) => `<url><loc>${l}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}</url>`).join("")}</urlset>`;

describe("parseSitemap", () => {
  it("parseSitemap_entriesWithAndWithoutLastmod_readsBoth", () => {
    expect(parseSitemap(xml([["https://johnojo.me/", "2026-10-27"], ["https://johnojo.me/work/"]]))).toEqual([
      { loc: "https://johnojo.me/", lastmod: "2026-10-27" },
      { loc: "https://johnojo.me/work/", lastmod: null },
    ]);
  });

  it("parseSitemap_emptyOrBroken_isEmpty", () => {
    expect(parseSitemap("<html>not a sitemap</html>")).toEqual([]);
  });
});

describe("changedUrls", () => {
  const live = parseSitemap(xml([["https://johnojo.me/", "2026-10-26"], ["https://johnojo.me/work/"]]));

  it("changedUrls_nothingChanged_isEmpty", () => {
    expect(changedUrls(live, live)).toEqual([]);
  });

  it("changedUrls_newPageAndMovedLastmod_areAnnounced", () => {
    const next = parseSitemap(xml([["https://johnojo.me/", "2026-10-27"], ["https://johnojo.me/work/"], ["https://johnojo.me/travel/rome/", "2026-10-28"]]));
    expect(changedUrls(live, next)).toEqual(["https://johnojo.me/", "https://johnojo.me/travel/rome/"]);
  });

  it("changedUrls_liveSitemapMissing_announcesEverything", () => {
    expect(changedUrls([], live)).toHaveLength(2);
  });
});

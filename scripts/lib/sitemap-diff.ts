/** Which sitemap entries are new or changed, so a publish only announces what actually moved. */
export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

export function parseSitemap(xml: string): SitemapEntry[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap(([, body]) => {
    const loc = body.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    return loc ? [{ loc, lastmod: body.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null }] : [];
  });
}

/** New URLs, and URLs whose lastmod moved. Pages without a lastmod are only announced when they first appear. */
export function changedUrls(live: SitemapEntry[], next: SitemapEntry[]): string[] {
  const before = new Map(live.map((e) => [e.loc, e.lastmod]));
  return next.filter((e) => !before.has(e.loc) || before.get(e.loc) !== e.lastmod).map((e) => e.loc);
}

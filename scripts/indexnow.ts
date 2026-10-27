/**
 * npm run indexnow: tells Bing (and the other IndexNow engines: Yandex, Seznam, Naver) about every page in
 * the live sitemap, so new trips and posts are picked up in days instead of waiting for a crawl.
 * https://www.indexnow.org/documentation
 *
 * The key isn't a secret: IndexNow proves ownership by fetching it from the site (public/<key>.txt).
 */
const SITE = "https://johnojo.me";
const KEY = "cd18bef054d9bc7bd1b2f4e18bec0305";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const TIMEOUT_MS = 15_000;
/** IndexNow accepts up to 10,000 URLs per request. */
const MAX_URLS = 10_000;

async function main() {
  const sitemap = await (await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(TIMEOUT_MS) })).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith(`${SITE}/`)).slice(0, MAX_URLS);
  if (!urls.length) throw new Error("No URLs found in the live sitemap.");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 200: accepted; 202: accepted, key check pending. Anything else names the problem.
  console.log(`IndexNow: ${res.status} for ${urls.length} URLs${res.ok ? "" : ` (${(await res.text()).slice(0, 200)})`}`);
  if (!res.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});

/**
 * npm run indexnow: tells Bing (and the other IndexNow engines: Yandex, Seznam, Naver) about every page in
 * the live sitemap, so new trips and posts are picked up in days instead of waiting for a crawl.
 * https://www.indexnow.org/documentation
 *
 * Runs on every production build too (npm run postbuild → --on-deploy), announcing only changed pages.
 * The key isn't a secret: IndexNow proves ownership by fetching it from the site (public/<key>.txt).
 */
import fs from "node:fs";
import path from "node:path";
import { changedUrls, parseSitemap } from "./lib/sitemap-diff";

const SITE = "https://johnojo.me";
const KEY = "cd18bef054d9bc7bd1b2f4e18bec0305"; // gitleaks:allow (public by design: served at /<key>.txt)
const ENDPOINT = "https://api.indexnow.org/indexnow";
const TIMEOUT_MS = 15_000;
/** IndexNow accepts up to 10,000 URLs per request. */
const MAX_URLS = 10_000;
/** Cloudflare Pages sets these during its build; only production builds announce anything. */
const ON_PAGES_PRODUCTION = process.env.CF_PAGES === "1" && process.env.CF_PAGES_BRANCH === "main";

async function submit(urls: string[]): Promise<Response> {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls.slice(0, MAX_URLS) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * --on-deploy (run by postbuild): compares the sitemap just built with the live one and announces only new
 * or changed pages. Never fails the build: a search engine being slow or down must not block a publish.
 */
async function onDeploy() {
  if (!ON_PAGES_PRODUCTION) return;
  try {
    const next = parseSitemap(fs.readFileSync(path.join("out", "sitemap.xml"), "utf8"));
    let live: ReturnType<typeof parseSitemap> = [];
    try {
      live = parseSitemap(await (await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(TIMEOUT_MS) })).text());
    } catch (err) {
      console.warn(`IndexNow: couldn't read the live sitemap (${(err as Error).name}); announcing every page.`);
    }
    const urls = changedUrls(live, next);
    if (!urls.length) return console.log("IndexNow: nothing changed.");
    const res = await submit(urls);
    console.log(`IndexNow: ${res.status} for ${urls.length} changed URL(s)`);
  } catch (err) {
    console.warn(`IndexNow: skipped (${(err as Error).name}: ${(err as Error).message})`);
  }
}

/** Manual run: announce every page in the live sitemap. */
async function all() {
  const urls = parseSitemap(await (await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(TIMEOUT_MS) })).text()).map((e) => e.loc).filter((u) => u.startsWith(`${SITE}/`));
  if (!urls.length) throw new Error("No URLs found in the live sitemap.");
  const res = await submit(urls);
  // 200: accepted; 202: accepted, key check pending. Anything else names the problem.
  console.log(`IndexNow: ${res.status} for ${urls.length} URLs${res.ok ? "" : ` (${(await res.text()).slice(0, 200)})`}`);
  if (!res.ok) process.exitCode = 1;
}

const main = () => (process.argv.includes("--on-deploy") ? onDeploy() : all());

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});

/**
 * npm run check:links   (after `npm run build`)
 *
 * Scans every page in out/ for internal links, images, videos and scripts, and fails if any of them
 * points at a file that isn't in the build. External links aren't fetched.
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const pages: string[] = [];
const walk = (d: string) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".html")) pages.push(p);
  }
};
walk(OUT);

const exists = (url: string) => {
  const clean = decodeURIComponent(url.split(/[?#]/)[0]);
  if (!clean || clean === "/") return true;
  const p = path.join(OUT, clean);
  return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, "index.html")));
};

const broken = new Map<string, Set<string>>();
for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  const urls = new Set<string>();
  for (const m of html.matchAll(/(?:href|src|poster)="([^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/srcSet="([^"]+)"|srcset="([^"]+)"/g)) (m[1] ?? m[2]).split(",").forEach((part) => urls.add(part.trim().split(" ")[0]));
  for (const u of urls) {
    if (!u.startsWith("/") || u.startsWith("//")) continue; // external, mailto:, anchors
    if (!exists(u)) {
      const rel = "/" + path.relative(OUT, page);
      broken.set(u, (broken.get(u) ?? new Set()).add(rel));
    }
  }
}

if (broken.size) {
  console.error(`${broken.size} broken internal link(s):`);
  for (const [u, from] of broken) console.error(`  ${u}\n    on ${[...from].slice(0, 3).join(", ")}${from.size > 3 ? ` +${from.size - 3} more` : ""}`);
  process.exit(1);
}
console.log(`Checked ${pages.length} pages: no broken internal links.`);

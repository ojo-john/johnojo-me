/**
 * npm run schedule:due — run daily by .github/workflows/scheduled-publish.yml. Lists everything with a
 * publish date and says whether today's rebuild is needed (something became due today or yesterday).
 * Reads the content files directly so it needs no build. Writes due=true|false for the workflow.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { DEFAULT_TIME_ZONE, isDue, somethingDue, todayIn } from "../src/lib/content/schedule";

const CONTENT = path.join(process.cwd(), "content");
const DAY_MS = 86_400_000;

const read = (file: string): Record<string, unknown> => (YAML.parse(fs.readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
const files = (dir: string, ext: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f)) : []);
const dateOf = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v : undefined);

/** Every scheduled item as [what, date]. Drafts are skipped: they never publish on their own. */
function scheduled(): [string, string][] {
  const out: [string, string][] = [];
  const add = (what: string, doc: Record<string, unknown>, field = "publishAt") => {
    const d = dateOf(doc[field]);
    if (d && doc.status !== "draft") out.push([what, d]);
  };
  for (const t of fs.existsSync(path.join(CONTENT, "trips")) ? fs.readdirSync(path.join(CONTENT, "trips")) : []) {
    const f = path.join(CONTENT, "trips", t, "trip.yaml");
    if (fs.existsSync(f)) add(`Trip · ${t}`, read(f));
  }
  for (const f of files(path.join(CONTENT, "visits"), ".yaml")) add(`Stop · ${path.basename(f, ".yaml")}`, read(f));
  for (const f of files(path.join(CONTENT, "projects"), ".yaml")) add(`Project · ${path.basename(f, ".yaml")}`, read(f));
  const exp = path.join(CONTENT, "experience.yaml");
  if (fs.existsSync(exp)) {
    const e = read(exp);
    for (const r of (e.roles as Record<string, unknown>[] | undefined) ?? []) add(`Job · ${r.title} at ${r.org}`, r);
    for (const m of (e.milestones as Record<string, unknown>[] | undefined) ?? []) add(`Milestone · ${m.title}`, m);
  }
  for (const f of files(path.join(CONTENT, "journal"), ".mdx")) {
    const front = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(f, "utf8"));
    if (front) add(`Post · ${path.basename(f, ".mdx")}`, YAML.parse(front[1]) ?? {}, "publishedAt");
  }
  return out;
}

const site = read(path.join(CONTENT, "site.yaml"));
const zone = typeof site.timeZone === "string" ? site.timeZone : DEFAULT_TIME_ZONE;
const now = new Date();
const today = todayIn(zone, now);
const yesterday = todayIn(zone, new Date(now.getTime() - DAY_MS));
const items = scheduled();
const due = somethingDue(items.map(([, d]) => d), today, yesterday);

console.log(`Today in ${zone}: ${today}`);
for (const [what, d] of items.sort((a, b) => a[1].localeCompare(b[1]))) console.log(`  ${isDue(d, today) ? "live     " : "scheduled"}  ${d}  ${what}`);
console.log(due ? "Something became due: rebuilding." : "Nothing new today.");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${due}\n`);

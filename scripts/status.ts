/**
 * npm run status
 *
 * Checklist of what each trip and city still needs: notes, scores, match answers, photos and videos.
 * Reads the media inbox ($MEDIA_SOURCE, default ~/workspace/johnojo-media), content/ and the media manifest.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

const SOURCE = process.env.MEDIA_SOURCE ?? path.join(os.homedir(), "workspace", "johnojo-media");
const ROOT = process.cwd();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "media-manifest.json"), "utf8")).items as Record<string, { type: string }>;
const VIDEO = /\.(mov|mp4|m4v)$/i;

/** Text under a "## Heading" in a notes file, ignoring the template's placeholder lines. */
function section(md: string, heading: string): string {
  const m = md.match(new RegExp(`## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`));
  return (m?.[1] ?? "").split("\n").filter((l) => l.trim() && !l.trim().startsWith("(") && !/^-\s*[^:]+:\s*$/.test(l.trim())).join(" ").trim();
}
const answered = (md: string, q: string) => {
  const line = md.split("\n").find((l) => l.includes(q));
  return !!line && line.split(q)[1].replace(/^[^:?]*[:?]/, "").trim().length > 0;
};

const visits = fs.readdirSync(path.join(ROOT, "content", "visits")).filter((f) => f.endsWith(".yaml"));
const byTrip = new Map<string, { file: string; v: Record<string, unknown> }[]>();
for (const f of visits) {
  const v = YAML.parse(fs.readFileSync(path.join(ROOT, "content", "visits", f), "utf8"));
  byTrip.set(v.trip, [...(byTrip.get(v.trip) ?? []), { file: f, v }]);
}

let todo = 0;
for (const [trip, list] of [...byTrip.entries()].sort()) {
  const tripYaml = YAML.parse(fs.readFileSync(path.join(ROOT, "content", "trips", trip, "trip.yaml"), "utf8"));
  console.log(`\n${tripYaml.title}${tripYaml.status === "draft" ? "  (draft, hidden)" : ""}`);
  for (const { file, v } of list.sort((a, b) => (a.v.order as number) - (b.v.order as number))) {
    const visitSlug = file.replace(/\.yaml$/, "").split("--")[1];
    const inboxName = (v.photoFolder as string) ?? fs.readdirSync(path.join(SOURCE, trip)).find((d) => slug(d) === visitSlug) ?? visitSlug;
    const inbox = path.join(SOURCE, trip, inboxName);
    const prefix = `${trip}/${slug(inboxName)}/`;
    const photos = Object.keys(manifest).filter((k) => k.startsWith(prefix) && manifest[k].type === "photo").length;
    const videos = Object.keys(manifest).filter((k) => k.startsWith(prefix) && manifest[k].type === "video").length;
    const inboxVideos = fs.existsSync(path.join(inbox, "videos")) ? fs.readdirSync(path.join(inbox, "videos")).filter((f) => VIDEO.test(f)) : [];
    const tooBig = inboxVideos.filter((f) => !manifest[`${prefix}videos/${slug(f.replace(/\.[^.]+$/, ""))}`]);
    const md = fs.existsSync(path.join(inbox, "notes.md")) ? fs.readFileSync(path.join(inbox, "notes.md"), "utf8") : "";
    const kind = (v.kind as string) ?? "city";
    const missing: string[] = [];
    if (!fs.existsSync(inbox)) missing.push("no folder in the media inbox");
    if (photos === 0) missing.push("no photos");
    if (tooBig.length) missing.push(`${tooBig.length} video(s) over 25 MB: ${tooBig.join(", ")}`);
    const story = section(md, "What I did") || (v.summary as string);
    if (kind === "match-only") {
      const qs = ["Where did you sit", "atmosphere in three words", "Best moment of the match", "Off the pitch", "First time at this stadium", "Would you go back"];
      // A first-person write-up already on the site covers the questions.
      const personal = ((v.matches as { writeUp?: string }[] | undefined) ?? []).some((m) => /\b(I|I'm|I've|my)\b/.test(m.writeUp ?? ""));
      const open = qs.filter((q) => !answered(md, q));
      if (open.length && !personal) missing.push(`match questions unanswered: ${open.length} of ${qs.length}`);
    } else {
      if (!story) missing.push("\"What I did\" notes");
      const scores = (md.match(/^(Food|Affordability|Public|Walkability|Architecture|Culture|People|Attractions|Safety|Overall)[^:\n]*:[ \t]*\S+/gm) ?? []).length;
      if (scores < 10) missing.push(`scores: ${scores} of 10`);
      if (!section(md, "Would I return")) missing.push("would you return?");
    }
    todo += missing.length;
    const label = `${String(v.order).padStart(2)}. ${visitSlug}${kind !== "city" ? ` (${kind})` : ""}`;
    console.log(`  ${missing.length ? "○" : "●"} ${label.padEnd(30)} ${String(photos).padStart(3)} photos ${String(videos).padStart(2)} videos${missing.length ? "   needs: " + missing.join("; ") : "   complete"}`);
  }
}
console.log(`\n${todo} item(s) still open. Notes live in ${SOURCE}/<trip>/<city>/notes.md`);

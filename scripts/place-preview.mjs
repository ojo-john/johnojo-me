// The admin preview: a second static export of the site with every draft and scheduled item showing,
// served at /admin/preview/, so the admin login (Cloudflare Access on /admin/*) is its only door.
//
//   --stash  after the preview build (PREVIEW_BUILD=1, basePath /admin/preview): keep only the pages,
//            dropping public/ files the live build already ships, and move it aside, because the live
//            build starts by emptying out/.
//   --place  after the live build: move it into out/admin/preview.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const OUT = path.join(root, "out");
const STASH = path.join(root, ".preview-out");
const TARGET = path.join(OUT, "admin", "preview");
// Search engines never see the preview, so its sitemap and robots file only add noise.
const ALSO_DROP = ["sitemap.xml", "robots.txt"];

function stash() {
  if (!fs.existsSync(OUT)) throw new Error("place-preview --stash: out/ is missing; run the preview build first.");
  for (const name of [...fs.readdirSync(path.join(root, "public")), ...ALSO_DROP]) fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
  fs.rmSync(STASH, { recursive: true, force: true });
  fs.renameSync(OUT, STASH);
  console.log("Preview build stashed in .preview-out");
}

function place() {
  if (!fs.existsSync(STASH)) throw new Error("place-preview --place: .preview-out is missing; run `npm run build:preview` first.");
  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.renameSync(STASH, TARGET);
  console.log("Preview placed at out/admin/preview");
}

if (process.argv.includes("--stash")) stash();
else if (process.argv.includes("--place")) place();
else throw new Error("place-preview: pass --stash or --place");

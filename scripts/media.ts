/**
 * npm run media
 *
 * Turns original photos and clips into web-ready copies and records them in content/media-manifest.json.
 *
 *   source:  $MEDIA_SOURCE (default ~/workspace/johnojo-media)/<trip>/<city>/{photos,videos}/*
 *   output:  public/media/<trip>/<city>/...  (AVIF + WebP + JPEG at several widths)
 *
 * Privacy: every output is re-encoded without metadata, so GPS location, camera serials and other
 * EXIF data never reach the website. Only the capture time is kept, in the manifest, for ordering
 * photos and matching football fixtures by date.
 *
 * Unchanged files are skipped (keyed on size + modified time), so re-running after adding a few
 * photos only processes the new ones.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import exifReader from "exif-reader";
import sharp from "sharp";
import { parse as parseYaml } from "yaml";

const SOURCE = process.env.MEDIA_SOURCE ?? path.join(os.homedir(), "workspace", "johnojo-media");
const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "media");
const MANIFEST = path.join(ROOT, "content", "media-manifest.json");
const CACHE = path.join(ROOT, ".cache", "media.json");

// 160 px serves thumbnails; the larger sizes serve cards, heroes and the full-screen viewer.
const WIDTHS = [160, 480, 960, 1600, 2400];
const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v"]);
/** Cloudflare Pages rejects files over 25 MiB; larger clips belong on YouTube (unlisted) or R2. */
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

type Variant = { w: number; avif: string; webp: string; jpg: string };
type Fingerprint = { hash?: string; bytes?: number; duplicateOf?: string };
type Entry =
  | ({ type: "photo"; w: number; h: number; variants: Variant[]; placeholder: string; takenAt: string | null } & Fingerprint)
  | ({ type: "video"; w: number; h: number; src: string; poster: string; takenAt: string | null } & Fingerprint);

/** Difference hash: 64 bits describing an image's light/dark pattern. Near-identical pictures differ by a few bits. */
async function dHash(file: string): Promise<string> {
  const px = await sharp(file).rotate().resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}
const hamming = (a: string, b: string) => {
  // Count differing bits, one hex digit at a time.
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
};
/** Photos this close are the same shot (including burst frames); clips must also match in size. */
const PHOTO_DUPLICATE_BITS = 5;
const VIDEO_DUPLICATE_BITS = 2;
/** Re-taken shots (same scene, slightly moved) sit too far apart to auto-hide, so they are only flagged. */
const REPEAT_WINDOW_SECONDS = 30;
const REPEAT_BITS = 30;
type Cache = Record<string, { key: string; id: string }>;

const VISITS = path.join(ROOT, "content", "visits");
const ROTATIONS = new Set([90, 180, 270]);

/** Same rule as the site's loader: "sedona + flagstaff" becomes "sedona-flagstaff" (no extension stripping). */
const folderSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Manual turns set in visit files (mediaMeta.<file>.rotate), keyed by media id. For photos whose camera
 * didn't record which way up they were, so the fix lands in the web copies and every viewer sees it upright.
 */
function loadRotations(): Record<string, number> {
  const out: Record<string, number> = {};
  if (!fs.existsSync(VISITS)) return out;
  for (const name of fs.readdirSync(VISITS).filter((f) => f.endsWith(".yaml"))) {
    const [trip, visit] = name.replace(/\.yaml$/, "").split("--");
    if (!trip || !visit) continue;
    let doc: { photoFolder?: string; mediaMeta?: unknown };
    try {
      doc = (parseYaml(fs.readFileSync(path.join(VISITS, name), "utf8")) ?? {}) as typeof doc;
    } catch (err) {
      // A broken visit file is reported by the site build; here it only means no rotations from it.
      console.warn(`  ! Couldn't read rotations from ${name}: ${(err as Error).message}`);
      continue;
    }
    // mediaMeta is a map in hand-written files and a list of { file, ... } rows when saved by the editor.
    const rows: [string, { rotate?: unknown }][] = Array.isArray(doc.mediaMeta)
      ? doc.mediaMeta.filter((r) => r && typeof r.file === "string").map((r) => [r.file, r])
      : Object.entries((doc.mediaMeta ?? {}) as Record<string, { rotate?: unknown }>);
    for (const [file, meta] of rows) {
      const turn = Number(meta?.rotate);
      if (!ROTATIONS.has(turn)) continue;
      const key = file.includes("/") ? file : `photos/${file}`;
      out[`${trip}/${folderSlug(doc.photoFolder ?? visit)}/${key}`] = turn;
    }
  }
  return out;
}

const readJson = <T,>(file: string, fallback: T): T => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback);
const slugify = (s: string) => s.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const webPath = (abs: string) => "/" + path.relative(path.join(ROOT, "public"), abs).split(path.sep).join("/");

/** EXIF DateTimeOriginal as local wall-clock ISO (no timezone): what the camera clock said. */
function exifDate(buf: Buffer | undefined): string | null {
  if (!buf) return null;
  try {
    const exif = exifReader(buf) as { Photo?: { DateTimeOriginal?: Date }; Image?: { DateTime?: Date } };
    const d = exif.Photo?.DateTimeOriginal ?? exif.Image?.DateTime;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 19) : null;
  } catch {
    return null;
  }
}

/** macOS Spotlight's content-creation date: a fallback when a file has no EXIF (videos, some downloads). */
function spotlightDate(file: string): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync("mdls", ["-raw", "-name", "kMDItemContentCreationDate", file], { encoding: "utf8", timeout: 10_000 });
    const d = new Date(out.trim());
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19);
  } catch {
    return null;
  }
}

/** sharp's prebuilt binaries can't decode iPhone HEIC, so convert those with macOS `sips` first. */
function decodable(file: string, tmp: string): string {
  if (![".heic", ".heif"].includes(path.extname(file).toLowerCase())) return file;
  if (process.platform !== "darwin") throw new Error(`HEIC needs macOS (sips) to convert: ${file}`);
  const out = path.join(tmp, crypto.randomUUID() + ".jpg");
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "95", file, "--out", out], { stdio: "ignore", timeout: 60_000 });
  return out;
}

async function processPhoto(file: string, outDir: string, base: string, tmp: string, turn: number): Promise<Entry> {
  const input = decodable(file, tmp);
  const meta = await sharp(input).metadata();
  const takenAt = exifDate(meta.exif) ?? exifDate((await sharp(file).metadata().catch(() => ({ exif: undefined }))).exif) ?? spotlightDate(file);
  // .rotate() applies the EXIF orientation; re-encoding without .withMetadata() drops all EXIF/GPS.
  // A manual turn goes on top of the EXIF one, so it needs the EXIF-oriented pixels first.
  const oriented = turn ? sharp(await sharp(input).rotate().jpeg({ quality: 95 }).toBuffer()).rotate(turn) : sharp(input).rotate();
  const { width = 0, height = 0 } = await oriented.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  const widths = [...new Set([...WIDTHS.filter((w) => w < width), Math.min(width, WIDTHS[WIDTHS.length - 1])])].sort((a, b) => a - b);
  fs.mkdirSync(outDir, { recursive: true });
  const variants: Variant[] = [];
  for (const w of widths) {
    const stem = path.join(outDir, `${base}-${w}`);
    const resized = oriented.clone().resize({ width: w, withoutEnlargement: true });
    await resized.clone().avif({ quality: 50, effort: 4 }).toFile(stem + ".avif");
    await resized.clone().webp({ quality: 74 }).toFile(stem + ".webp");
    await resized.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(stem + ".jpg");
    variants.push({ w, avif: webPath(stem + ".avif"), webp: webPath(stem + ".webp"), jpg: webPath(stem + ".jpg") });
  }
  const tiny = await oriented.clone().resize({ width: 20 }).webp({ quality: 40 }).toBuffer();
  return { type: "photo", w: width, h: height, variants, placeholder: `data:image/webp;base64,${tiny.toString("base64")}`, takenAt };
}

async function processVideo(file: string, outDir: string, base: string, tmp: string): Promise<Entry | null> {
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${base}.mp4`);
  if (process.platform === "darwin") {
    // avconvert ships with macOS: re-encode to 720p H.264 so clips stay small and play everywhere.
    execFileSync("avconvert", ["--source", file, "--preset", "Preset1280x720", "--output", out, "--replace"], { stdio: "ignore", timeout: 600_000 });
  } else {
    fs.copyFileSync(file, out);
  }
  if (fs.statSync(out).size > MAX_VIDEO_BYTES) {
    fs.rmSync(out);
    console.warn(`  ! ${path.basename(file)} is still over 25 MB after compressing. Trim it, or upload it to YouTube as unlisted.`);
    return null;
  }
  // Poster frame via Quick Look, then through sharp so it carries no metadata either.
  let poster = "";
  try {
    execFileSync("qlmanage", ["-t", "-s", "1280", "-o", tmp, file], { stdio: "ignore", timeout: 60_000 });
    const thumb = path.join(tmp, path.basename(file) + ".png");
    const posterOut = path.join(outDir, `${base}-poster.jpg`);
    const info = await sharp(thumb).resize({ width: 960, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toFile(posterOut);
    poster = webPath(posterOut);
    return { type: "video", w: info.width, h: info.height, src: webPath(out), poster, takenAt: spotlightDate(file) };
  } catch {
    return { type: "video", w: 1280, h: 720, src: webPath(out), poster, takenAt: spotlightDate(file) };
  }
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Media source not found: ${SOURCE}\nSet MEDIA_SOURCE to the folder holding <trip>/<city>/photos.`);
    process.exit(1);
  }
  const manifest = readJson<{ generatedAt: string; items: Record<string, Entry> }>(MANIFEST, { generatedAt: "", items: {} });
  const cache = readJson<Cache>(CACHE, {});
  const rotations = loadRotations();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "media-"));
  const seen = new Set<string>();
  const counts: Record<string, { photos: number; videos: number; first: string | null; last: string | null }> = {};
  let processed = 0, skipped = 0, failed = 0;

  // Folders starting with "_" (e.g. _not-on-site) are kept out of the site entirely.
  const folders = (dir: string) => fs.readdirSync(dir).filter((d) => !d.startsWith("_") && fs.statSync(path.join(dir, d)).isDirectory()).sort();
  for (const trip of folders(SOURCE)) {
    for (const city of folders(path.join(SOURCE, trip))) {
      for (const kind of ["photos", "videos"] as const) {
        const srcDir = path.join(SOURCE, trip, city, kind);
        if (!fs.existsSync(srcDir)) continue;
        for (const name of fs.readdirSync(srcDir).sort()) {
          const file = path.join(srcDir, name);
          const ext = path.extname(name).toLowerCase();
          if (!(kind === "photos" ? PHOTO_EXT : VIDEO_EXT).has(ext)) continue;
          const base = slugify(name);
          const citySlug = slugify(city);
          const id = `${trip}/${citySlug}/${kind}/${base}`;
          seen.add(id);
          const stat = fs.statSync(file);
          const turn = rotations[id] ?? 0;
          const key = `${stat.size}:${stat.mtimeMs}${turn ? `:r${turn}` : ""}`;
          if (cache[file]?.key === key && manifest.items[id]) {
            skipped++;
          } else {
            try {
              const outDir = path.join(OUT, trip, citySlug, kind);
              const entry = kind === "photos" ? await processPhoto(file, outDir, base, tmp, turn) : await processVideo(file, outDir, base, tmp);
              if (entry) {
                manifest.items[id] = entry;
                cache[file] = { key, id };
                processed++;
                console.log(`  ✓ ${id}${entry.takenAt ? `  (taken ${entry.takenAt.replace("T", " ")})` : "  (no capture date found)"}`);
              }
            } catch (err) {
              // One bad file must not stop the rest of the batch.
              failed++;
              console.error(`  ✗ ${trip}/${city}/${kind}/${name}: ${(err as Error).message}`);
            }
          }
          const e = manifest.items[id];
          if (e) {
            const c = (counts[`${trip}/${citySlug}`] ??= { photos: 0, videos: 0, first: null, last: null });
            c[kind]++;
            if (e.takenAt) {
              if (!c.first || e.takenAt < c.first) c.first = e.takenAt;
              if (!c.last || e.takenAt > c.last) c.last = e.takenAt;
            }
          }
        }
      }
    }
  }

  // Originals that were deleted or renamed: drop their entries and generated files.
  for (const id of Object.keys(manifest.items)) {
    if (seen.has(id)) continue;
    delete manifest.items[id];
    const [trip, city, kind, base] = id.split("/");
    const d = path.join(OUT, trip, city, kind);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.startsWith(base + "-") || f.startsWith(base + ".")) fs.rmSync(path.join(d, f));
  }

  // Duplicates: fingerprint every item, then within each city keep the earliest of any near-identical
  // group and mark the rest. The site never shows marked items; the originals are left untouched.
  const dupes: string[] = [];
  const repeats: string[] = [];
  for (const [id, e] of Object.entries(manifest.items)) {
    if (e.hash) continue;
    try {
      const pub = path.join(ROOT, "public");
      e.hash = await dHash(path.join(pub, e.type === "photo" ? e.variants[0].jpg : e.poster));
      if (e.type === "video") e.bytes = fs.statSync(path.join(pub, e.src)).size;
    } catch {
      /* no poster or unreadable file: skip fingerprinting rather than fail the run */
    }
  }
  const byCity = new Map<string, string[]>();
  for (const id of Object.keys(manifest.items)) {
    const city = id.split("/").slice(0, 2).join("/");
    byCity.set(city, [...(byCity.get(city) ?? []), id]);
  }
  for (const ids of byCity.values()) {
    ids.sort((a, b) => (manifest.items[a].takenAt ?? "").localeCompare(manifest.items[b].takenAt ?? "") || a.length - b.length || a.localeCompare(b));
    const kept: string[] = [];
    for (const id of ids) {
      const e = manifest.items[id];
      delete e.duplicateOf;
      const match = e.hash
        ? kept.find((k) => {
            const o = manifest.items[k];
            if (!o.hash || o.type !== e.type) return false;
            if (e.type === "photo") return hamming(o.hash, e.hash as string) <= PHOTO_DUPLICATE_BITS;
            return hamming(o.hash, e.hash as string) <= VIDEO_DUPLICATE_BITS && Math.abs((o.bytes ?? 0) - (e.bytes ?? 0)) <= 0.05 * Math.max(o.bytes ?? 1, 1);
          })
        : undefined;
      if (match) {
        e.duplicateOf = match;
        dupes.push(`${id}  →  same as ${match.split("/").pop()}`);
        continue;
      }
      const repeat = e.hash && e.takenAt
        ? kept.find((k) => {
            const o = manifest.items[k];
            if (!o.hash || !o.takenAt || o.type !== e.type) return false;
            const gap = Math.abs(Date.parse(e.takenAt as string) - Date.parse(o.takenAt)) / 1000;
            return gap <= REPEAT_WINDOW_SECONDS && hamming(o.hash, e.hash as string) <= REPEAT_BITS;
          })
        : undefined;
      if (repeat) repeats.push(`${id}  ↔  ${repeat.split("/").pop()}`);
      kept.push(id);
    }
  }

  manifest.generatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n${processed} processed, ${skipped} unchanged, ${failed} failed.`);
  const rows = Object.entries(counts);
  if (rows.length) {
    console.log("\nWhat's in each city (capture dates help match football fixtures):");
    for (const [k, c] of rows) console.log(`  ${k.padEnd(28)} ${String(c.photos).padStart(3)} photos ${String(c.videos).padStart(2)} videos   ${c.first ? `${c.first.slice(0, 10)} → ${c.last?.slice(0, 10)}` : "no dates"}`);
  }
  if (dupes.length) {
    console.log(`\nHidden as duplicates (${dupes.length}). To show one anyway, delete its twin from the media folder:`);
    for (const d of dupes) console.log(`  ${d}`);
  }
  if (repeats.length) {
    console.log(`\nPossible repeats taken seconds apart (${repeats.length}). Check them; hide one with mediaMeta "hidden: true" if they look the same:`);
    for (const r of repeats) console.log(`  ${r}`);
  }
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

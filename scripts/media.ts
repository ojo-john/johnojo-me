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

const SOURCE = process.env.MEDIA_SOURCE ?? path.join(os.homedir(), "workspace", "johnojo-media");
const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "media");
const MANIFEST = path.join(ROOT, "content", "media-manifest.json");
const CACHE = path.join(ROOT, ".cache", "media.json");

const WIDTHS = [480, 960, 1600, 2400];
const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v"]);
/** Cloudflare Pages rejects files over 25 MiB; larger clips belong on YouTube (unlisted) or R2. */
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

type Variant = { w: number; avif: string; webp: string; jpg: string };
type Entry =
  | { type: "photo"; w: number; h: number; variants: Variant[]; placeholder: string; takenAt: string | null }
  | { type: "video"; w: number; h: number; src: string; poster: string; takenAt: string | null };
type Cache = Record<string, { key: string; id: string }>;

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

async function processPhoto(file: string, outDir: string, base: string, tmp: string): Promise<Entry> {
  const input = decodable(file, tmp);
  const meta = await sharp(input).metadata();
  const takenAt = exifDate(meta.exif) ?? exifDate((await sharp(file).metadata().catch(() => ({ exif: undefined }))).exif) ?? spotlightDate(file);
  // .rotate() applies the EXIF orientation; re-encoding without .withMetadata() drops all EXIF/GPS.
  const oriented = sharp(input).rotate();
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
    const info = await sharp(thumb).jpeg({ quality: 80, mozjpeg: true }).toFile(posterOut);
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "media-"));
  const seen = new Set<string>();
  const counts: Record<string, { photos: number; videos: number; first: string | null; last: string | null }> = {};
  let processed = 0, skipped = 0, failed = 0;

  for (const trip of fs.readdirSync(SOURCE).filter((d) => fs.statSync(path.join(SOURCE, d)).isDirectory()).sort()) {
    for (const city of fs.readdirSync(path.join(SOURCE, trip)).filter((d) => fs.statSync(path.join(SOURCE, trip, d)).isDirectory()).sort()) {
      for (const kind of ["photos", "videos"] as const) {
        const srcDir = path.join(SOURCE, trip, city, kind);
        if (!fs.existsSync(srcDir)) continue;
        for (const name of fs.readdirSync(srcDir).sort()) {
          const file = path.join(srcDir, name);
          const ext = path.extname(name).toLowerCase();
          if (!(kind === "photos" ? PHOTO_EXT : VIDEO_EXT).has(ext)) continue;
          const base = slugify(name);
          const id = `${trip}/${city}/${kind}/${base}`;
          seen.add(id);
          const stat = fs.statSync(file);
          const key = `${stat.size}:${stat.mtimeMs}`;
          if (cache[file]?.key === key && manifest.items[id]) {
            skipped++;
          } else {
            try {
              const outDir = path.join(OUT, trip, city, kind);
              const entry = kind === "photos" ? await processPhoto(file, outDir, base, tmp) : await processVideo(file, outDir, base, tmp);
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
            const c = (counts[`${trip}/${city}`] ??= { photos: 0, videos: 0, first: null, last: null });
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
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

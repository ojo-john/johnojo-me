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
import ffmpegPath from "ffmpeg-static";
import sharp, { type Sharp } from "sharp";
import { focusFromFaces, type Focus } from "../src/lib/content/focus";
import { findFaces } from "./lib/faces";
import { videoDateFrom } from "./lib/video-date";
import { loadEdits } from "./lib/edits";
import { fileSlug, folderSlug, PHOTO_EXT, sourceKey, VIDEO_EXT } from "./lib/ids";
import type { PhotoEdit } from "../src/lib/content/photo-edits";

const SOURCE = process.env.MEDIA_SOURCE ?? path.join(os.homedir(), "workspace", "johnojo-media");
const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "media");
const MANIFEST = path.join(ROOT, "content", "media-manifest.json");
const CACHE = path.join(ROOT, ".cache", "media.json");

// 160 px serves thumbnails; the larger sizes serve cards, heroes and the full-screen viewer.
const WIDTHS = [160, 480, 960, 1600, 2400];
const KEEP_UNSEEN = process.env.MEDIA_KEEP_UNSEEN === "1";
/** Cloudflare Pages rejects files over 25 MiB; larger clips belong on YouTube (unlisted) or R2. */
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

type Variant = { w: number; avif: string; webp: string; jpg: string };
type Fingerprint = { hash?: string; bytes?: number; duplicateOf?: string };
/** Where the subject sits, as percentages across (x) and down (y): the CSS object-position for crops. */

/** Width the focus probe works at: plenty to find faces, quick to compute. */
const FOCUS_PROBE = 400;
const CENTRE = 50;

type Entry =
  | ({ type: "photo"; w: number; h: number; variants: Variant[]; placeholder: string; takenAt: string | null; focus?: Focus; focusBy?: "faces" | "attention"; source?: string } & Fingerprint)
  | ({ type: "video"; w: number; h: number; src: string; poster: string; takenAt: string | null; source?: string } & Fingerprint);

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
/** Per original: its id, the stat it was last seen with (legacy skip key) and its MD5. Local speed-up only. */
type Cache = Record<string, { key?: string; id?: string; statKey?: string; md5?: string }>;

const VISITS = path.join(ROOT, "content", "visits");

const readJson = <T,>(file: string, fallback: T): T => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback);
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

/** sharp's prebuilt binaries can't decode iPhone HEIC, so convert those first (sips on a Mac, heif-convert on Linux). */
function decodable(file: string, tmp: string): string {
  if (![".heic", ".heif"].includes(path.extname(file).toLowerCase())) return file;
  const out = path.join(tmp, crypto.randomUUID() + ".jpg");
  if (process.platform === "darwin") {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "95", file, "--out", out], { stdio: "ignore", timeout: 60_000 });
  } else {
    // Linux (the cloud job installs libheif-examples): heif-convert keeps the EXIF, so dates and orientation survive.
    execFileSync("heif-convert", ["-q", "95", file, out], { stdio: "ignore", timeout: 60_000 });
  }
  return out;
}

/**
 * Find the most important part of the photo (faces and skin tones weigh most) with sharp's attention
 * strategy, once as a wide crop (which part to keep top-to-bottom) and once as a tall crop (side-to-side).
 * Covers and thumbnails crop to fit their frame; this keeps that crop on the people instead of the middle.
 */
async function focusPoint(oriented: Sharp): Promise<Focus> {
  const { data, info: base } = await oriented.clone().resize({ width: FOCUS_PROBE }).toBuffer({ resolveWithObject: true });
  const crop = async (width: number, height: number) =>
    (await sharp(data).resize(width, height, { fit: "cover", position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true })).info;
  const short = Math.round((FOCUS_PROBE * 9) / 16);
  const wide = await crop(FOCUS_PROBE, short);
  const tall = await crop(short, FOCUS_PROBE);
  // Offsets come back as negative pixels into the scaled image; turn them into a share of the spare room.
  const pct = (offset: number | undefined, spare: number) => (spare > 0 ? Math.min(100, Math.round((Math.abs(offset ?? 0) / spare) * 100)) : CENTRE);
  const tallScaledWidth = (base.width * FOCUS_PROBE) / base.height;
  return { x: pct(tall.cropOffsetLeft, tallScaledWidth - short), y: pct(wide.cropOffsetTop, base.height - short) };
}

const FACE_PREVIEW_MIN_WIDTH = 960;

/**
 * Point every photo's focus at its faces, when it has any (scripts/lib/faces.ts runs anywhere Node does).
 * Runs on the upright, metadata-free web copies, so manual turns are already applied. Each photo is
 * checked once; focusBy records the outcome, and clearing it makes the next run check again.
 */
async function applyFaceFocus(items: Record<string, Entry>): Promise<number> {
  const pending = Object.entries(items).filter((pair): pair is [string, Entry & { type: "photo" }] => pair[1].type === "photo" && !pair[1].focusBy);
  let withFaces = 0;
  for (const [id, e] of pending) {
    const file = path.join(ROOT, "public", (e.variants.find((v) => v.w >= FACE_PREVIEW_MIN_WIDTH) ?? e.variants[e.variants.length - 1]).jpg);
    try {
      const focus = focusFromFaces(await findFaces(file));
      if (focus) {
        e.focus = focus;
        withFaces++;
      }
      e.focusBy = focus ? "faces" : "attention";
    } catch (err) {
      // Keeps the colour-based focus; focusBy stays unset so the next run tries this photo again.
      console.warn(`  ! Face check failed for ${id}: ${(err as Error).message}`);
    }
  }
  return withFaces;
}

/** EXIF orientation, then any manual turn on top (that needs the EXIF-oriented pixels first). */
async function orientedImage(input: string, turn: number): Promise<Sharp> {
  return turn ? sharp(await sharp(input).rotate().jpeg({ quality: 95 }).toBuffer()).rotate(turn) : sharp(input).rotate();
}

/** EXIF orientation, then the editor's turn and crop (crop is in percent of the turned photo). */
async function editedImage(input: string, edit: PhotoEdit | undefined): Promise<Sharp> {
  const turned = await orientedImage(input, edit?.rotate ?? 0);
  if (!edit?.crop) return turned;
  const { data, info } = await turned.jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true });
  const px = (pct: number, total: number) => Math.max(0, Math.min(total, Math.round((pct / 100) * total)));
  const left = px(edit.crop.x, info.width), top = px(edit.crop.y, info.height);
  const width = Math.max(1, Math.min(info.width - left, px(edit.crop.w, info.width)));
  const height = Math.max(1, Math.min(info.height - top, px(edit.crop.h, info.height)));
  return sharp(await sharp(data).extract({ left, top, width, height }).jpeg({ quality: 95 }).toBuffer());
}

/**
 * The uncropped, unturned (but EXIF-upright) copy the editor's photo tool draws on, so a crop can always
 * be changed later. Lives in public/_edit for the local preview only: postbuild never ships it, and the
 * cloud copy sits in the private originals bucket.
 */
const EDIT_DIR = path.join(ROOT, "public", "_edit");
const EDIT_EDGE = 1280;
const editPreviewPath = (id: string) => path.join(EDIT_DIR, `${id}.jpg`);
async function writeEditPreview(input: string, id: string): Promise<void> {
  const out = editPreviewPath(id);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(input).rotate().resize(EDIT_EDGE, EDIT_EDGE, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(out);
}


/** MD5 of an original (R2 reports the same value as its ETag), remembered while the file is unchanged. */
function fileMd5(file: string, stat: fs.Stats, cache: Cache): string {
  const key = `${stat.size}:${stat.mtimeMs}`;
  const hit = cache[file];
  if (hit?.md5 && hit.statKey === key) return hit.md5;
  const md5 = crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
  cache[file] = { ...hit, statKey: key, md5 };
  return md5;
}

async function processPhoto(file: string, outDir: string, base: string, tmp: string, edit: PhotoEdit | undefined, id: string): Promise<Entry> {
  const input = decodable(file, tmp);
  await writeEditPreview(input, id);
  const meta = await sharp(input).metadata();
  const takenAt = exifDate(meta.exif) ?? exifDate((await sharp(file).metadata().catch(() => ({ exif: undefined }))).exif) ?? spotlightDate(file);
  // .rotate() applies the EXIF orientation; re-encoding without .withMetadata() drops all EXIF/GPS.
  const oriented = await editedImage(input, edit);
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
  return { type: "photo", w: width, h: height, variants, placeholder: `data:image/webp;base64,${tiny.toString("base64")}`, takenAt, focus: await focusPoint(oriented) };
}

/** Bundled ffmpeg (ffmpeg-static), so video works the same on a Mac and in the cloud. */
const FFMPEG = ffmpegPath as unknown as string;
/** Long edge of web clips: 720p-class, small enough for phones, sharp enough for a lightbox. */
const VIDEO_EDGE = 1280;
/** H.264 quality (lower = better, bigger). 26 keeps most clips a few MB. */
const VIDEO_CRF = "26";

function videoDate(file: string): string | null {
  try {
    execFileSync(FFMPEG, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"], timeout: 30_000 });
    return null;
  } catch (err) {
    // With no output file ffmpeg exits non-zero, but it has printed the container's tags to stderr.
    return videoDateFrom(String((err as { stderr?: Buffer | string }).stderr ?? ""));
  }
}

async function processVideo(file: string, outDir: string, base: string, tmp: string): Promise<Entry | null> {
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${base}.mp4`);
  const takenAt = videoDate(file) ?? spotlightDate(file);
  // Re-encode to H.264/AAC with the long edge at most VIDEO_EDGE. -map_metadata -1 drops every tag,
  // including the GPS location phones write into clips; ffmpeg applies the rotation flag to the pixels.
  const scale = `scale='if(gt(iw,ih),min(${VIDEO_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${VIDEO_EDGE},ih))'`;
  execFileSync(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-map_metadata", "-1", "-map_chapters", "-1", "-vf", scale, "-c:v", "libx264", "-crf", VIDEO_CRF, "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out],
    { stdio: "ignore", timeout: 900_000 },
  );
  if (fs.statSync(out).size > MAX_VIDEO_BYTES) {
    fs.rmSync(out);
    console.warn(`  ! ${path.basename(file)} is still over 25 MB after compressing. Trim it, or upload it to YouTube as unlisted.`);
    return null;
  }
  // Poster: a frame half a second in (skips a black first frame), through sharp so it carries no metadata.
  const frame = path.join(tmp, `${base}-frame.png`);
  try {
    execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.5", "-i", out, "-frames:v", "1", frame], { stdio: "ignore", timeout: 60_000 });
    const posterOut = path.join(outDir, `${base}-poster.jpg`);
    const info = await sharp(frame).resize({ width: 960, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toFile(posterOut);
    return { type: "video", w: info.width, h: info.height, src: webPath(out), poster: webPath(posterOut), takenAt };
  } catch (err) {
    console.warn(`  ! No poster frame for ${path.basename(file)}: ${(err as Error).message}`);
    return { type: "video", w: VIDEO_EDGE, h: 720, src: webPath(out), poster: "", takenAt };
  }
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Media source not found: ${SOURCE}\nSet MEDIA_SOURCE to the folder holding <trip>/<city>/photos.`);
    process.exit(1);
  }
  const manifest = readJson<{ generatedAt: string; items: Record<string, Entry> }>(MANIFEST, { generatedAt: "", items: {} });
  const cache = readJson<Cache>(CACHE, {});
  const edits = loadEdits(VISITS);
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
          const base = fileSlug(name);
          const citySlug = folderSlug(city); // same rule as the site, so "st. moritz" matches st-moritz
          const id = `${trip}/${citySlug}/${kind}/${base}`;
          seen.add(id);
          const stat = fs.statSync(file);
          const edit = kind === "photos" ? edits[id] : undefined;
          const source = sourceKey(stat.size, fileMd5(file, stat, cache), edit);
          const existing = manifest.items[id];
          // Before source keys existed, the skip test was size + modified time (+ turn); honour it once.
          const turn = edit?.rotate ?? 0;
          const legacy = !existing?.source && cache[file]?.key === `${stat.size}:${stat.mtimeMs}${turn ? `:r${turn}` : ""}` && !edit?.crop;
          if (existing && (existing.source === source || legacy)) {
            existing.source = source;
            skipped++;
            if (kind === "photos" && !fs.existsSync(editPreviewPath(id))) {
              try {
                await writeEditPreview(decodable(file, tmp), id);
              } catch (err) {
                console.warn(`  ! No editor preview for ${id}: ${(err as Error).message}`);
              }
            }
            // Photos processed before focus points existed get one without re-making every size.
            if (existing.type === "photo" && !existing.focus) {
              try {
                existing.focus = await focusPoint(await editedImage(decodable(file, tmp), edit));
              } catch (err) {
                console.warn(`  ! No focus point for ${id}: ${(err as Error).message}`);
              }
            }
          } else {
            try {
              const outDir = path.join(OUT, trip, citySlug, kind);
              const entry = kind === "photos" ? await processPhoto(file, outDir, base, tmp, edit, id) : await processVideo(file, outDir, base, tmp);
              if (entry) {
                manifest.items[id] = { ...entry, source };
                cache[file] = { ...cache[file], id };
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

  // Originals that were deleted or renamed: drop their entries and generated files. The cloud job only
  // downloads new or edited originals, so there "not seen" means "not downloaded": it sets MEDIA_KEEP_UNSEEN.
  for (const id of KEEP_UNSEEN ? [] : Object.keys(manifest.items)) {
    if (seen.has(id)) continue;
    delete manifest.items[id];
    const [trip, city, kind, base] = id.split("/");
    const d = path.join(OUT, trip, city, kind);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.startsWith(base + "-") || f.startsWith(base + ".")) fs.rmSync(path.join(d, f));
    fs.rmSync(editPreviewPath(id), { force: true });
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
    } catch (err) {
      // No poster or an unreadable file: this item just isn't checked for duplicates; the run carries on.
      console.warn(`  ! Couldn't fingerprint ${id} for duplicate checks: ${(err as Error).message}`);
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

  const faced = await applyFaceFocus(manifest.items);
  if (faced) console.log(`Centred ${faced} photo(s) on faces for covers and thumbnails.`);

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

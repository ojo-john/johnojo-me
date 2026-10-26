/**
 * Choices made in the editor's "Photos & videos" manager, stored on a visit as plain lines:
 *   order: photos/img-0995, videos/img-1154, photos/img-1006
 *   photos/img-0995 rotate=90 crop=10,5,80,70
 *   videos/img-1154 trim=1.5,9
 *   photos/img-1006 hide        # anything after # is a note
 *   photos/img-1010 delete
 * rotate: clockwise degrees. crop: left, top, width, height in percent of the turned photo. trim: start and
 * end in seconds. hide keeps it off the site; delete also removes the original (kept in a recovery folder).
 * `npm run media` bakes rotate, crop and trim into the web copies.
 */
export type Crop = { x: number; y: number; w: number; h: number };
export type Trim = { start: number; end: number };
export type MediaEdit = { rotate?: 90 | 180 | 270; crop?: Crop; trim?: Trim; hide?: boolean; delete?: boolean };
/** Kept for older imports: photo edits are media edits. */
export type PhotoEdit = MediaEdit;

const ROTATIONS = new Set([90, 180, 270]);
/** A crop smaller than this (percent of either side) is almost certainly a slip of the mouse. */
const MIN_CROP = 5;
/** Shortest clip a trim may leave, in seconds. */
const MIN_TRIM = 0.5;

const round1 = (n: number) => Math.round(n * 10) / 10;
const keyOf = (file: string) => (file.includes("/") ? file : `photos/${file}`);

export function parseCrop(text: string): Crop | null {
  const n = text.split(",").map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  const [x, y, w, h] = n;
  if (x < 0 || y < 0 || w < MIN_CROP || h < MIN_CROP || x + w > 100.05 || y + h > 100.05) return null;
  // A full-frame crop is no crop.
  if (x === 0 && y === 0 && w >= 100 && h >= 100) return null;
  return { x, y, w: Math.min(w, 100 - x), h: Math.min(h, 100 - y) };
}

export function parseTrim(text: string): Trim | null {
  const n = text.split(",").map(Number);
  if (n.length !== 2 || n.some((v) => !Number.isFinite(v))) return null;
  const [start, end] = n;
  return start >= 0 && end - start >= MIN_TRIM ? { start, end } : null;
}

export interface ParsedEdits {
  edits: Record<string, MediaEdit>;
  /** Display order chosen in the editor; items not listed follow, oldest first. */
  order: string[];
  problems: string[];
}

/** Lines that don't parse are skipped (and reported by the caller), so one typo can't break a visit. */
export function parsePhotoEdits(text: string | undefined): ParsedEdits {
  const edits: Record<string, MediaEdit> = {};
  const problems: string[] = [];
  let order: string[] = [];
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("order:")) {
      order = line.slice("order:".length).split(",").map((s) => s.trim()).filter(Boolean).map(keyOf);
      continue;
    }
    const [file, ...parts] = line.split(/\s+/);
    const edit: MediaEdit = {};
    for (const part of parts) {
      const [k, v = ""] = part.split("=");
      if (k === "rotate" && ROTATIONS.has(Number(v))) edit.rotate = Number(v) as MediaEdit["rotate"];
      else if (k === "crop" && parseCrop(v)) edit.crop = parseCrop(v) as Crop;
      else if (k === "trim" && parseTrim(v)) edit.trim = parseTrim(v) as Trim;
      else if (k === "hide" && !v) edit.hide = true;
      else if (k === "delete" && !v) edit.delete = true;
      else problems.push(`"${part}" for ${file} isn't valid (rotate=90|180|270, crop=l,t,w,h, trim=start,end, hide, delete)`);
    }
    if (Object.keys(edit).length) edits[keyOf(file)] = edit;
  }
  return { edits, order, problems };
}

export function formatPhotoEdits(edits: Record<string, MediaEdit>, order: string[] = []): string {
  const lines = Object.entries(edits)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, e]) =>
      [
        file,
        e.rotate ? `rotate=${e.rotate}` : "",
        e.crop ? `crop=${[e.crop.x, e.crop.y, e.crop.w, e.crop.h].map(round1).join(",")}` : "",
        e.trim ? `trim=${round1(e.trim.start)},${round1(e.trim.end)}` : "",
        e.hide ? "hide" : "",
        e.delete ? "delete" : "",
      ].filter(Boolean),
    )
    .filter((bits) => bits.length > 1)
    .map((bits) => bits.join(" "));
  return [order.length ? `order: ${order.join(", ")}` : "", ...lines].filter(Boolean).join("\n");
}

/** What changes the web copy itself (rotate, crop, trim), so changing it makes `npm run media` re-make it. */
export const editSignature = (e: MediaEdit | undefined) =>
  e ? [e.rotate ? `r${e.rotate}` : "", e.crop ? `c${e.crop.x},${e.crop.y},${e.crop.w},${e.crop.h}` : "", e.trim ? `t${e.trim.start},${e.trim.end}` : ""].join("") : "";

/** Items in the chosen order first, then the rest as they came (oldest first). */
export function applyOrder<T extends { key: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items;
  const rank = new Map(order.map((k, i) => [k, i]));
  return [...items].sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity));
}

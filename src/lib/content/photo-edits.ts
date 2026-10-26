/**
 * Rotate and crop choices made in the editor's photo tool, stored on a visit as one line per photo:
 *   photos/img-0995 rotate=90 crop=10,5,80,70
 * rotate is clockwise degrees; crop is left, top, width, height as percentages of the photo after it's
 * been turned upright and rotated. `npm run media` bakes both into the web copies.
 */
export type Crop = { x: number; y: number; w: number; h: number };
export type PhotoEdit = { rotate?: 90 | 180 | 270; crop?: Crop };

const ROTATIONS = new Set([90, 180, 270]);
/** A crop smaller than this (percent of either side) is almost certainly a slip of the mouse. */
const MIN_CROP = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function parseCrop(text: string): Crop | null {
  const n = text.split(",").map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  const [x, y, w, h] = n;
  if (x < 0 || y < 0 || w < MIN_CROP || h < MIN_CROP || x + w > 100.05 || y + h > 100.05) return null;
  // A full-frame crop is no crop.
  if (x === 0 && y === 0 && w >= 100 && h >= 100) return null;
  return { x, y, w: Math.min(w, 100 - x), h: Math.min(h, 100 - y) };
}

/** Lines that don't parse are skipped (and reported by the caller), so one typo can't break a visit. */
export function parsePhotoEdits(text: string | undefined): { edits: Record<string, PhotoEdit>; problems: string[] } {
  const edits: Record<string, PhotoEdit> = {};
  const problems: string[] = [];
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [file, ...parts] = line.split(/\s+/);
    const edit: PhotoEdit = {};
    for (const part of parts) {
      const [k, v = ""] = part.split("=");
      if (k === "rotate" && ROTATIONS.has(Number(v))) edit.rotate = Number(v) as PhotoEdit["rotate"];
      else if (k === "crop" && parseCrop(v)) edit.crop = parseCrop(v) as Crop;
      else problems.push(`"${part}" for ${file} isn't a valid rotate=90|180|270 or crop=left,top,width,height`);
    }
    const key = file.includes("/") ? file : `photos/${file}`;
    if (edit.rotate || edit.crop) edits[key] = edit;
  }
  return { edits, problems };
}

export function formatPhotoEdits(edits: Record<string, PhotoEdit>): string {
  return Object.entries(edits)
    .filter(([, e]) => e.rotate || e.crop)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, e]) =>
      [file, e.rotate ? `rotate=${e.rotate}` : "", e.crop ? `crop=${[e.crop.x, e.crop.y, e.crop.w, e.crop.h].map(round1).join(",")}` : ""].filter(Boolean).join(" "),
    )
    .join("\n");
}

/** A short signature of an edit, so changing it makes `npm run media` re-make that photo. */
export const editSignature = (e: PhotoEdit | undefined) =>
  e ? [e.rotate ? `r${e.rotate}` : "", e.crop ? `c${e.crop.x},${e.crop.y},${e.crop.w},${e.crop.h}` : ""].join("") : "";

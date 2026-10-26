/** A face box from the Vision face finder: fractions of the image, origin at the top-left. */
export type FaceBox = { x: number; y: number; w: number; h: number };
/** Where to keep a cropped photo centred, as percentages across and down (CSS object-position). */
export type Focus = { x: number; y: number };

/** Faces smaller than this share of the biggest one are passers-by in the background, not the subject. */
const MIN_FACE_SHARE = 0.25;

/** Centre of the main faces (background faces dropped), as percentages; null when there are none. */
export function focusFromFaces(faces: FaceBox[]): Focus | null {
  if (faces.length === 0) return null;
  const biggest = Math.max(...faces.map((f) => f.w * f.h));
  const main = faces.filter((f) => f.w * f.h >= biggest * MIN_FACE_SHARE);
  const left = Math.min(...main.map((f) => f.x)), right = Math.max(...main.map((f) => f.x + f.w));
  const top = Math.min(...main.map((f) => f.y)), bottom = Math.max(...main.map((f) => f.y + f.h));
  const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100)));
  return { x: pct((left + right) / 2), y: pct((top + bottom) / 2) };
}


/**
 * Where to put each pin's name so it doesn't sit on another pin or name: try each side in turn (right,
 * left, below, above, then the corners) and keep the first spot that's clear, or failing that the one
 * that overlaps least. Greedy and in map units, so it runs again whenever the map zooms.
 */
export type Side = "right" | "left" | "below" | "above" | "upper-right" | "lower-right" | "upper-left" | "lower-left";

export interface LabelPin {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface PlacedLabel {
  id: string;
  side: Side;
  /** Text anchor point and alignment, ready for an SVG <text>. */
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  /** No clear spot was found and skipCrowded was set: leave this name off (zooming in usually frees room). */
  hidden: boolean;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const SIDES: Side[] = ["right", "left", "below", "above", "upper-right", "lower-right", "upper-left", "lower-left"];
/** How much worse a name cut off by the map's edge is than one touching a neighbour. */
const EDGE_WEIGHT = 4;
/** Average glyph width as a share of the font size, for a bold UI face. */
const CHAR_WIDTH = 0.64;

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

function candidate(p: LabelPin, side: Side, pinR: number, fontSize: number, gap: number): { box: Box; label: PlacedLabel } {
  const w = p.label.length * fontSize * CHAR_WIDTH;
  const h = fontSize * 1.2;
  const off = pinR + gap;
  const dx = side.includes("right") ? 1 : side.includes("left") ? -1 : 0;
  const dy = side === "below" || side.startsWith("lower") ? 1 : side === "above" || side.startsWith("upper") ? -1 : 0;
  // Corners sit diagonally off the pin; straight sides sit beside, above or below it.
  const cx = p.x + dx * (dy ? off * 0.75 : off);
  const cy = p.y + dy * (dx ? off * 0.75 : off) + (dy > 0 ? h / 2 : dy < 0 ? -h / 2 : 0);
  const anchor: PlacedLabel["anchor"] = dx > 0 ? "start" : dx < 0 ? "end" : "middle";
  const x0 = anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2;
  return { box: { x0, y0: cy - h / 2, x1: x0 + w, y1: cy + h / 2 }, label: { id: p.id, side, x: cx, y: cy, anchor, hidden: false } };
}

export function placeLabels(
  pins: readonly LabelPin[],
  {
    pinR,
    fontSize,
    gap = 6,
    skipCrowded = false,
    bounds,
  }: {
    pinR: number;
    fontSize: number;
    gap?: number;
    skipCrowded?: boolean;
    /** The visible area. A name running past its edge would be cut off, so that counts as overlap too. */
    bounds?: Box;
  },
): PlacedLabel[] {
  const taken: Box[] = pins.map((p) => ({ x0: p.x - pinR, y0: p.y - pinR, x1: p.x + pinR, y1: p.y + pinR }));
  // Top to bottom, so placement is stable and matches how the map is read.
  return [...pins]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((p) => {
      const options = SIDES.map((side, order) => {
        const c = candidate(p, side, pinR, fontSize, gap);
        const inside = bounds ? area(c.box, bounds) : 0;
        const outside = bounds ? (c.box.x1 - c.box.x0) * (c.box.y1 - c.box.y0) - inside : 0;
        // Being cut off is worse than touching a neighbour, so it weighs more.
        return { ...c, order, cost: taken.reduce((sum, t) => sum + area(c.box, t), 0) + outside * EDGE_WEIGHT };
      });
      const best = options.sort((a, b) => a.cost - b.cost || a.order - b.order)[0];
      // A name that can't be placed cleanly is left off rather than drawn over something, and doesn't take room.
      if (skipCrowded && best.cost > 0) return { ...best.label, hidden: true };
      taken.push(best.box);
      return best.label;
    });
}

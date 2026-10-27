/** A sideways swipe at least this long (px) moves to the next photo. */
export const SWIPE_PX = 40;
/** A finger or mouse has to move this far (px) sideways before a press counts as dragging the strip. */
export const DRAG_PX = 6;
/** Each slide's share of the strip's width; the rest shows the next photo peeking in. */
export const SLIDE_PCT = 88;
/** Space between slides (px); matches .gal-rail's gap. */
export const SLIDE_GAP_PX = 10;

/**
 * Which way a finished swipe moves the strip: +1 next, -1 previous, 0 stay. Mostly vertical moves are page
 * scrolls, not swipes.
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) <= SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** Keeps an index inside a strip of `count` slides. */
export function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

/**
 * The CSS translateX that shows slide `index`. Percentages are of the strip's width. The first slide sits
 * flush left, the last flush right, and the ones between are centred, so a neighbour always peeks in.
 */
export function railOffset(index: number, count: number): string {
  if (count <= 1 || index <= 0) return "0px";
  const shift = `${index} * (${SLIDE_PCT}% + ${SLIDE_GAP_PX}px)`;
  const lead = index >= count - 1 ? 100 - SLIDE_PCT : (100 - SLIDE_PCT) / 2;
  return `calc(${lead}% - ${shift})`;
}

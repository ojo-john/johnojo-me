/**
 * Lets a component report a named choice that isn't a click (e.g. Enter in the Jump to list). Kept apart
 * from the tracker so pages carry no tracker code when metrics are off; with nothing listening, the
 * event simply goes nowhere.
 */
export const TRACK_EVENT = "metrics:track";

/**
 * Clicks that end a swipe, drag or pinch are swallowed by the component (they mustn't open a photo or a
 * pin); marking them here keeps the counter from counting them as clicks either.
 */
const swallowed = new WeakSet<Event>();
export const swallowClick = (e: Event) => swallowed.add(e);
export const wasSwallowed = (e: Event) => swallowed.has(e);

export const track = (label: string) => window.dispatchEvent(new CustomEvent(TRACK_EVENT, { detail: label }));

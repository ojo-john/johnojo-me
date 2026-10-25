/**
 * Lets a component report a named choice that isn't a click (e.g. Enter in the Jump to list). Kept apart
 * from the tracker so pages carry no tracker code when metrics are off; with nothing listening, the
 * event simply goes nowhere.
 */
export const TRACK_EVENT = "metrics:track";

export const track = (label: string) => window.dispatchEvent(new CustomEvent(TRACK_EVENT, { detail: label }));

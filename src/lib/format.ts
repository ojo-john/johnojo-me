/** Date helpers that cope with partial dates (YYYY-MM or YYYY-MM-DD) and missing values. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

export function formatDate(d: string | undefined | null): string | null {
  if (!d) return null;
  const { y, m, day } = parts(d);
  return day ? `${day} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

/** "14–17 Mar 2022", "29 May – 2 Jun 2023", or a single date when only one end is known. */
export function formatRange(start?: string | null, end?: string | null): string | null {
  if (!start) return formatDate(end);
  if (!end || end === start) return formatDate(start);
  const a = parts(start), b = parts(end);
  if (!a.day || !b.day) return `${formatDate(start)} – ${formatDate(end)}`;
  if (a.y === b.y && a.m === b.m) return `${a.day}–${b.day} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.day} ${MONTHS[a.m - 1]} – ${b.day} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Whole days between two full dates, inclusive; null when either end is unknown or partial. */
export function durationDays(start?: string | null, end?: string | null): number | null {
  if (!start || !end || start.length < 10 || end.length < 10) return null;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

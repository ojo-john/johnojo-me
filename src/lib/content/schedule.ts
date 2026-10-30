/**
 * Scheduled publishing. A trip, stop, project, job or journal post can carry a publish date; until that
 * day starts in the site's time zone it's left out of every build, exactly like a draft. The daily
 * "Scheduled publish" workflow rebuilds the site on any day something is due, so it appears on its own.
 * Dates only (YYYY-MM-DD): the site is rebuilt once a day, so a time of day would be a false promise.
 */

/** Used when site.yaml doesn't set timeZone. */
export const DEFAULT_TIME_ZONE = "America/Chicago";

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True when there's no publish date, or it's today or earlier. A month alone (YYYY-MM) means its first day. */
export function isDue(publishOn: string | undefined, today: string): boolean {
  if (!publishOn) return true;
  const day = publishOn.length === 7 ? `${publishOn}-01` : publishOn;
  return day <= today;
}

/** Whether a rebuild is needed today: something became due today, or yesterday in case that day's run was missed. */
export function somethingDue(publishDates: string[], today: string, yesterday: string): boolean {
  return publishDates.some((d) => {
    const day = d.length === 7 ? `${d}-01` : d;
    return day === today || day === yesterday;
  });
}

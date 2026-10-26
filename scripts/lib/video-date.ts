/**
 * When the clip was recorded. iPhones write the real moment, in local time, as
 * com.apple.quicktime.creationdate; the generic creation_time is often when the file was exported or
 * AirDropped, so it's only the fallback. Local wall-clock time, like photo dates.
 */
export function videoDateFrom(info: string): string | null {
  const apple = info.match(/com\.apple\.quicktime\.creationdate\s*:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (apple) return apple[1];
  const generic = info.match(/creation_time\s*:\s*(\S+)/);
  const d = generic ? new Date(generic[1]) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 19) : null;
}

/** Clip length in seconds from ffmpeg's "Duration: 00:00:40.64" line, or null. */
export function videoDurationFrom(info: string): number | null {
  const m = info.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  return m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 100) / 100 : null;
}

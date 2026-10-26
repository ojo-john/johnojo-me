/** Decisions behind the media commands, kept free of I/O so they can be tested directly. */
import type { PhotoEdit } from "../../src/lib/content/photo-edits";
import { originalKeyToId, sourceKey } from "./ids";
import type { StoredObject } from "./store";

export interface PublishPlan {
  upload: string[];
  remove: string[];
  /** Wanted by the site but neither in the bucket nor on this machine: the publish must not go ahead. */
  missing: string[];
  unchanged: number;
}

/**
 * Bring the public bucket in line with what the site shows. `wanted` maps each key the site uses to the
 * MD5 of the local file, or null when the file isn't on this machine (normal in the cloud job, which only
 * has the photos it just processed). Anything else under `prefix` in the bucket is removed.
 */
export function planPublish(wanted: Map<string, string | null>, remote: StoredObject[], prefix = "media/"): PublishPlan {
  const byKey = new Map(remote.map((o) => [o.key, o]));
  const plan: PublishPlan = { upload: [], remove: [], missing: [], unchanged: 0 };
  for (const [key, md5] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
    const r = byKey.get(key);
    if (r && (md5 === null || r.etag === md5)) plan.unchanged++;
    else if (md5) plan.upload.push(key);
    else plan.missing.push(key);
  }
  plan.remove = remote.filter((o) => o.key.startsWith(prefix) && !wanted.has(o.key)).map((o) => o.key).sort();
  return plan;
}

/**
 * Which originals the cloud job must download: those never processed, or whose bytes or edit changed
 * since (their recorded source differs). Everything else is already on the site.
 */
export function planPull(originals: StoredObject[], sources: Record<string, string | undefined>, edits: Record<string, PhotoEdit>): string[] {
  return originals
    .flatMap((o) => {
      const parsed = originalKeyToId(o.key);
      if (!parsed) return [];
      const expected = sourceKey(o.size, o.etag, parsed.kind === "photos" ? edits[parsed.id] : undefined);
      return sources[parsed.id] === expected ? [] : [o.key];
    })
    .sort();
}

/** Originals on this machine that the bucket lacks or holds an older copy of. Never deletes: local copies may be cleared after backup. */
export function planBackup(local: Map<string, { size: number; md5: string }>, remote: StoredObject[]): string[] {
  const byKey = new Map(remote.map((o) => [o.key, o]));
  return [...local].filter(([key, f]) => byKey.get(key)?.etag !== f.md5).map(([key]) => key).sort();
}

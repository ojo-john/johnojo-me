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
export function planPull(originals: StoredObject[], sources: Record<string, string | undefined>, edits: Record<string, PhotoEdit>, rebuild: ReadonlySet<string> = new Set()): string[] {
  return originals
    .flatMap((o) => {
      const parsed = originalKeyToId(o.key);
      if (!parsed || edits[parsed.id]?.delete) return [];
      if (rebuild.has(parsed.id)) return [o.key];
      const expected = sourceKey(o.size, o.etag, edits[parsed.id]);
      return sources[parsed.id] === expected ? [] : [o.key];
    })
    .sort();
}

/** The manifest's web files, as bucket keys ("media/t/c/photos/a-480.jpg"), mapped to the photo or clip they belong to. */
export function webCopyOwners(items: Record<string, { variants?: { avif: string; webp: string; jpg: string }[]; src?: string; poster?: string }>): Map<string, string> {
  const owners = new Map<string, string>();
  const add = (url: string | undefined, id: string) => {
    if (url) owners.set(url.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, ""), id);
  };
  for (const [id, e] of Object.entries(items)) {
    for (const v of e.variants ?? []) [v.avif, v.webp, v.jpg].forEach((u) => add(u, id));
    add(e.src, id);
    add(e.poster, id);
  }
  return owners;
}

/**
 * Photos and clips the site wants whose web copies aren't in storage (lost, or removed by mistake). The
 * cloud job only has what it downloads, so these must be made again from their originals.
 * `stored` holds the keys present, under the same names as `wanted`.
 */
export function idsMissingWebCopies(wanted: Iterable<string>, stored: ReadonlySet<string>, owners: ReadonlyMap<string, string>): Set<string> {
  const ids = new Set<string>();
  for (const key of wanted) {
    const id = owners.get(key);
    if (id && !stored.has(key)) ids.add(id);
  }
  return ids;
}

/** Originals on this machine that the bucket lacks or holds an older copy of. Never deletes: local copies may be cleared after backup. */
export function planBackup(local: Map<string, { size: number; md5: string }>, remote: StoredObject[]): string[] {
  const byKey = new Map(remote.map((o) => [o.key, o]));
  return [...local].filter(([key, f]) => byKey.get(key)?.etag !== f.md5).map(([key]) => key).sort();
}

/** Originals deleted in the editor: moved to _deleted/ in the bucket (recoverable), never processed again. */
export function planDeletes(originals: StoredObject[], edits: Record<string, PhotoEdit>): string[] {
  return originals.filter((o) => {
    const parsed = originalKeyToId(o.key);
    return parsed && edits[parsed.id]?.delete;
  }).map((o) => o.key).sort();
}

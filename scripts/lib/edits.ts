/**
 * Every rotate/crop choice from the visit files, keyed by media id ("utah-2025/salt-lake-city/photos/100-0074").
 * Two sources, newest wins: the editor's photo tool (photoEdits) and the older per-photo mediaMeta.rotate.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { parsePhotoEdits, type PhotoEdit } from "../../src/lib/content/photo-edits";
import { folderSlug } from "./ids";

const ROTATIONS = new Set([90, 180, 270]);

export function loadEdits(visitsDir: string, warn: (msg: string) => void = console.warn): Record<string, PhotoEdit> {
  const out: Record<string, PhotoEdit> = {};
  if (!fs.existsSync(visitsDir)) return out;
  for (const name of fs.readdirSync(visitsDir).filter((f) => f.endsWith(".yaml"))) {
    const [trip, visit] = name.replace(/\.yaml$/, "").split("--");
    if (!trip || !visit) continue;
    let doc: { photoFolder?: string; mediaMeta?: unknown; photoEdits?: string };
    try {
      doc = (parseYaml(fs.readFileSync(path.join(visitsDir, name), "utf8")) ?? {}) as typeof doc;
    } catch (err) {
      // A broken visit file is reported by the site build; here it only means no edits from it.
      warn(`  ! Couldn't read photo edits from ${name}: ${(err as Error).message}`);
      continue;
    }
    const prefix = `${trip}/${folderSlug(doc.photoFolder ?? visit)}/`;
    // mediaMeta is a map in hand-written files and a list of { file, ... } rows when saved by the editor.
    const rows: [string, { rotate?: unknown }][] = Array.isArray(doc.mediaMeta)
      ? doc.mediaMeta.filter((r) => r && typeof r.file === "string").map((r) => [r.file, r])
      : Object.entries((doc.mediaMeta ?? {}) as Record<string, { rotate?: unknown }>);
    for (const [file, meta] of rows) {
      const turn = Number(meta?.rotate);
      if (ROTATIONS.has(turn)) out[prefix + (file.includes("/") ? file : `photos/${file}`)] = { rotate: turn as PhotoEdit["rotate"] };
    }
    const { edits, problems } = parsePhotoEdits(typeof doc.photoEdits === "string" ? doc.photoEdits : undefined);
    problems.forEach((p) => warn(`  ! ${name}: ${p}`));
    for (const [file, edit] of Object.entries(edits)) out[prefix + file] = { ...out[prefix + file], ...edit };
  }
  return out;
}

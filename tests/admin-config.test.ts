import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { destination, experience, post, project, site, trip, visit } from "@/lib/content/schema";

/**
 * Drift check between the browser editor (public/admin/config.yml) and the content schemas
 * (src/lib/content/schema.ts). The editor writes the files the build validates, so if the two disagree
 * John can save something that breaks the build, or can't edit a field at all. Every rule below fails
 * loudly with the path of the field, e.g. "visits.rating.scores.food".
 */

const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.join(ROOT, "content");
const config = YAML.parse(fs.readFileSync(path.join(ROOT, "public/admin/config.yml"), "utf8")) as CmsConfig;

/** Which schema each editor collection (or file inside "settings") writes. A new collection must be added here. */
const SCHEMAS: Record<string, z.ZodType> = {
  trips: trip,
  visits: visit,
  places: destination,
  journal: post,
  projects: project,
  "settings.site": site,
  "settings.experience": experience,
};

/** Schema fields deliberately left out of the editor. Their values are kept when a file is saved. */
const NOT_IN_EDITOR: Record<string, string> = {
  "visits.rating.notes": "per-score notes aren't shown anywhere on the site yet",
  "visits.rating.tieBreakNote": "not shown anywhere on the site yet",
  "journal.cover": "post covers aren't shown on the site yet",
  "journal.coverAlt": "post covers aren't shown on the site yet",
};

/** Editor fields that aren't schema keys. */
const NOT_IN_SCHEMA: Record<string, string> = {
  "journal.body": "the post text below the frontmatter, not a frontmatter key",
};

/** Fields the editor always shows although the schema could do without them. Blank values inside are still left out. */
const REQUIRED_IN_EDITOR_ONLY: Record<string, string> = {
  "visits.rating.scores": "the ten score boxes appear as soon as Scores is added; blank scores are left out of the file",
};

/** Schema options deliberately not offered in a select. */
const OPTIONS_NOT_OFFERED: Record<string, string[]> = {
  // Only trips use "Coming soon". Everywhere else it would behave exactly like Published.
  "visits.status": ["coming-soon"],
  "journal.status": ["coming-soon"],
  "projects.status": ["coming-soon"],
};

/**
 * Known problems in real content, waiting for John's OK before the files change. In these flow maps an
 * unquoted comma ends the caption early, so "Sleeping Beauty Castle, Disneyland Paris" shows as
 * "Sleeping Beauty Castle" and "Disneyland Paris" becomes a stray key. Quoting the caption fixes it.
 * Remove each line once its file is fixed; the check then guards against the mistake coming back.
 */
const KNOWN_STRAY_KEYS = [
  "visits/europe-2021--paris.yaml: visits.mediaMeta[].Disneyland Paris",
  "visits/europe-2021--paris.yaml: visits.mediaMeta[].Disneyland Paris",
  "visits/europe-2024--nice.yaml: visits.mediaMeta[].Nice",
];

/** Strings that date-like and id-like patterns must accept or reject exactly like the schema does. */
const PATTERN_SAMPLES = ["2025-10", "2025-10-03", "2025", "2025-1", "Oct 2025", "porto", "st-moritz", "Porto", "a--b", ""];

/* ---------------------------------------------------------------- config and zod introspection */

interface CmsField {
  name: string;
  widget?: string;
  required?: boolean;
  fields?: CmsField[];
  field?: CmsField;
  options?: (string | { label: string; value: string })[];
  value_type?: string;
  min?: number;
  max?: number;
  type?: string;
  format?: string;
  pattern?: [string, string];
  map_key_field?: string;
}
interface CmsCollection {
  name: string;
  folder?: string;
  fields?: CmsField[];
  files?: { name: string; file: string; fields: CmsField[] }[];
}
interface CmsConfig {
  output?: { omit_empty_optional_fields?: boolean };
  collections: CmsCollection[];
}

type Def = { type: string; innerType?: z.ZodType; in?: z.ZodType; out?: z.ZodType; shape?: Record<string, z.ZodType>; element?: z.ZodType; valueType?: z.ZodType; entries?: Record<string, string> };
const def = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def;

/** Peel off optional/default/nullable wrappers and preprocess/transform steps to reach the shape underneath. */
function core(s: z.ZodType): z.ZodType {
  for (;;) {
    const d = def(s);
    if (["optional", "nullable", "default", "prefault", "readonly", "catch"].includes(d.type)) s = d.innerType!;
    else if (d.type === "pipe") s = def(d.in!).type === "transform" ? d.out! : d.in!;
    else return s;
  }
}
const kind = (s: z.ZodType) => def(core(s)).type;
const accepts = (s: z.ZodType, v: unknown) => s.safeParse(v).success;

/** Collect every problem as a readable line, so one run lists all drift instead of stopping at the first. */
function compareFields(fields: CmsField[], shape: Record<string, z.ZodType>, at: string, problems: string[]) {
  for (const f of fields) {
    const p = `${at}.${f.name}`;
    if (!(f.name in shape)) {
      if (!NOT_IN_SCHEMA[p]) problems.push(`${p}: in the editor but not in the schema`);
      continue;
    }
    compareField(f, shape[f.name], p, problems);
  }
  for (const key of Object.keys(shape)) {
    const p = `${at}.${key}`;
    if (!fields.some((f) => f.name === key) && !NOT_IN_EDITOR[p]) problems.push(`${p}: in the schema but missing from the editor`);
  }
}

function compareField(f: CmsField, s: z.ZodType, p: string, problems: string[]) {
  const widget = f.widget ?? "string";
  const optionalInSchema = accepts(s, undefined);
  const optionalInEditor = f.required === false;
  if (optionalInSchema !== optionalInEditor && !(optionalInSchema && REQUIRED_IN_EDITOR_ONLY[p])) {
    problems.push(`${p}: ${optionalInSchema ? "optional" : "required"} in the schema but ${optionalInEditor ? "optional" : "required"} in the editor`);
  }
  const c = core(s);
  const k = kind(s);
  const d = def(c);

  switch (widget) {
    case "object":
      if (k !== "object") return void problems.push(`${p}: object in the editor, ${k} in the schema`);
      return compareFields(f.fields ?? [], d.shape!, p, problems);

    case "keyvalue":
      if (k !== "record" || kind(d.valueType!) !== "string") problems.push(`${p}: key-value in the editor needs a map of text in the schema`);
      return;

    case "list": {
      if (f.map_key_field) {
        // Saved as a map keyed by one subfield, e.g. mediaMeta: { photos/img-1: { caption } }.
        if (k !== "record" || kind(d.valueType!) !== "object") return void problems.push(`${p}: keyed list in the editor needs a map of objects in the schema`);
        return compareFields((f.fields ?? []).filter((x) => x.name !== f.map_key_field), def(core(d.valueType!)).shape!, p, problems);
      }
      if (k === "record") {
        // mapOrList(value, key, valueName): the editor saves [{ key, value }], the schema turns it into a map.
        const [keyField, valueField, ...rest] = f.fields ?? [];
        if (!keyField || !valueField || rest.length) return void problems.push(`${p}: a map in the schema needs a two-field list (key, value) in the editor`);
        return compareField({ ...valueField, required: valueField.required }, d.valueType!, `${p}[].${valueField.name}`, problems);
      }
      if (k !== "array") return void problems.push(`${p}: list in the editor, ${k} in the schema`);
      const element = d.element!;
      if (f.fields) {
        if (kind(element) !== "object") return void problems.push(`${p}: list of objects in the editor, list of ${kind(element)} in the schema`);
        return compareFields(f.fields, def(core(element)).shape!, `${p}[]`, problems);
      }
      if (f.field) return compareField({ ...f.field, required: false }, element.optional(), `${p}[]`, problems);
      if (kind(element) !== "string") problems.push(`${p}: list of text in the editor, list of ${kind(element)} in the schema`);
      return;
    }

    case "number": {
      if (k !== "number") return void problems.push(`${p}: number in the editor, ${k} in the schema`);
      const intInSchema = !accepts(c, 0.5);
      if (intInSchema !== (f.value_type === "int")) problems.push(`${p}: whole numbers ${intInSchema ? "only" : "not required"} in the schema, value_type ${f.value_type ?? "(none)"} in the editor`);
      const step = intInSchema ? 1 : 0.5;
      for (const [bound, dir] of [["min", -1], ["max", 1]] as const) {
        const limit = f[bound];
        if (limit === undefined) {
          if (!accepts(c, dir * 1e9)) problems.push(`${p}: the schema has a ${bound} but the editor doesn't`);
        } else if (!accepts(c, limit) || accepts(c, limit + dir * step)) {
          problems.push(`${p}: editor ${bound} ${limit} doesn't match the schema`);
        }
      }
      return;
    }

    case "boolean":
      if (k !== "boolean") problems.push(`${p}: on/off switch in the editor, ${k} in the schema`);
      return;

    case "select": {
      if (k !== "enum") return void problems.push(`${p}: select in the editor, ${k} in the schema`);
      const offered = (f.options ?? []).map((o) => (typeof o === "string" ? o : o.value));
      const allowed = Object.values(d.entries!);
      const skipped = OPTIONS_NOT_OFFERED[p] ?? [];
      for (const o of offered) if (!allowed.includes(o)) problems.push(`${p}: option "${o}" isn't allowed by the schema`);
      for (const o of allowed) if (!offered.includes(o) && !skipped.includes(o)) problems.push(`${p}: schema option "${o}" is missing from the editor`);
      return;
    }

    case "datetime":
      if (f.type !== "date" || f.format !== "YYYY-MM-DD") problems.push(`${p}: dates must use type: date and format: YYYY-MM-DD`);
      if (!accepts(c, "2024-04-03")) problems.push(`${p}: the schema doesn't accept a YYYY-MM-DD date`);
      return;

    default: {
      // string, text, relation: all saved as text.
      if (!["string", "union"].includes(k)) return void problems.push(`${p}: text in the editor, ${k} in the schema`);
      if (f.pattern) {
        const re = new RegExp(f.pattern[0]);
        for (const sample of PATTERN_SAMPLES) {
          if (re.test(sample) !== accepts(c, sample)) problems.push(`${p}: editor pattern and schema disagree about "${sample}"`);
        }
      }
    }
  }
}

/* ---------------------------------------------------------------- real content files */

/** Every key in a content file must be something the editor shows (or a deliberate exclusion), or John can't see it. */
function unknownKeys(data: unknown, fields: CmsField[], at: string, out: string[]) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  for (const [key, value] of Object.entries(data)) {
    const p = `${at}.${key}`;
    const f = fields.find((x) => x.name === key);
    if (!f) {
      if (!NOT_IN_EDITOR[p.replace(/\[\d+\]/g, "[]").replace(/^[^:]+: /, "")]) out.push(p);
      continue;
    }
    if (f.widget === "object") unknownKeys(value, f.fields ?? [], p, out);
    else if (f.widget === "list" && f.fields) {
      const sub = f.fields.filter((x) => x.name !== f.map_key_field);
      const items = Array.isArray(value) ? value : f.map_key_field && value && typeof value === "object" ? Object.values(value) : [];
      items.forEach((item) => unknownKeys(item, sub, `${p}[]`, out));
    }
  }
}

const listFiles = (dir: string, test: (f: string) => boolean) =>
  fs.readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(test).map((f) => path.join(dir, f));

function readContent(file: string): unknown {
  const raw = fs.readFileSync(file, "utf8");
  if (!file.endsWith(".mdx")) return YAML.parse(raw);
  return YAML.parse(raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "");
}

/* ---------------------------------------------------------------- tests */

const targets = config.collections.flatMap((c) =>
  c.files ? c.files.map((f) => ({ id: `${c.name}.${f.name}`, fields: f.fields, files: [path.join(ROOT, f.file)] })) : [{ id: c.name, fields: c.fields ?? [], files: listFiles(path.join(ROOT, c.folder!), (f) => /\.(ya?ml|mdx)$/.test(f)) }],
);

describe("editor config (public/admin/config.yml) matches the content schemas", () => {
  it("config_everyCollectionHasASchema_noUnmappedCollections", () => {
    expect(targets.map((t) => t.id).filter((id) => !SCHEMAS[id])).toEqual([]);
  });

  it("config_blankOptionalFields_areLeftOutOfSavedFiles", () => {
    // The required/optional comparison below assumes blank optional fields are omitted, not saved as "" or null.
    expect(config.output?.omit_empty_optional_fields).toBe(true);
  });

  it.each(Object.keys(SCHEMAS))("config_%s_fieldsMatchSchema", (id) => {
    const target = targets.find((t) => t.id === id);
    const problems: string[] = [];
    compareFields(target?.fields ?? [], def(core(SCHEMAS[id])).shape!, id, problems);
    expect(problems).toEqual([]);
  });

  it("content_everyKeyInRealFiles_isEditable", () => {
    const unknown: string[] = [];
    for (const t of targets) {
      for (const file of t.files) unknownKeys(readContent(file), t.fields, `${path.relative(CONTENT, file)}: ${t.id}`, unknown);
    }
    expect(unknown).toEqual(KNOWN_STRAY_KEYS);
  });

  it("content_realFiles_existForEveryCollection", () => {
    expect(targets.filter((t) => t.files.length === 0).map((t) => t.id)).toEqual([]);
  });
});

/**
 * Light and dark mode guard rails (see the token block at the top of src/app/globals.css):
 * - every text and graphic colour pair meets WCAG AA contrast in both modes;
 * - no colour is written anywhere except that token block, so anything new gets both modes;
 * - the browser bar colour matches the page background.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveTheme, storedTheme, THEME_COLOR } from "@/lib/theme";

const ROOT = join(__dirname, "..");
const CSS_PATH = join(ROOT, "src/app/globals.css");
const css = readFileSync(CSS_PATH, "utf8");

/** WCAG AA: 4.5:1 for normal text, 3:1 for large text and for graphics (map lines, pins, borders that carry meaning). */
const TEXT = 4.5;
const GRAPHIC = 3;

type Mode = "light" | "dark";
const MODES: Mode[] = ["light", "dark"];

/** The :root token block: everything from "--chalk" to the first non-colour token. */
function tokenBlock(): string {
  const start = css.indexOf(":root {");
  return css.slice(start, css.indexOf("}", start));
}

/** Each colour token's value in each mode. A plain value is the same in both. */
function tokens(): Record<string, Record<Mode, string>> {
  const out: Record<string, Record<Mode, string>> = {};
  for (const m of tokenBlock().matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = m;
    const pair = value.match(/^light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i);
    if (pair) out[name] = { light: pair[1], dark: pair[2] };
    else if (/^#[0-9a-f]{6}$/i.test(value)) out[name] = { light: value, dark: value };
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum, where it's used]. */
const PAIRS: [string, string, number, string][] = [
  ["ink", "chalk", TEXT, "body text on the page"],
  ["ink", "paper", TEXT, "text on cards"],
  ["ink-2", "chalk", TEXT, "secondary text on the page"],
  ["ink-2", "paper", TEXT, "secondary text on cards"],
  ["paper", "ink", TEXT, "filled buttons, selected tabs and chips"],
  ["on-fill", "work", TEXT, "text on Work bands and panels"],
  ["on-fill", "travel", TEXT, "text on Travel bands and panels"],
  ["on-fill", "journal", TEXT, "text on Journal bands, verses and chips"],
  ["on-fill", "media", TEXT, "footer and full-screen viewer"],
  ["work", "on-fill", TEXT, "band button text (pillar colour on a light pill)"],
  ["travel", "on-fill", TEXT, "band button text (pillar colour on a light pill)"],
  ["journal", "on-fill", TEXT, "band button text (pillar colour on a light pill)"],
  ["on-sun", "sun", TEXT, "text on yellow labels and highlights"],
  ["work-ink", "chalk", TEXT, "Work-coloured text on the page"],
  ["work-ink", "paper", TEXT, "Work-coloured text on cards"],
  ["journal-ink", "chalk", TEXT, "Journal-coloured text on the page"],
  ["journal-ink", "paper", TEXT, "Journal-coloured text on cards"],
  ["ink", "land", TEXT, "city names on maps"],
  ["travel-line", "land", GRAPHIC, "routes and pins on maps"],
  ["travel-line", "paper", GRAPHIC, "score rings and bars on cards"],
  ["ink", "paper", GRAPHIC, "card borders"],
];

describe("theme tokens", () => {
  const t = tokens();

  it.each(PAIRS.flatMap(([fg, bg, min, use]) => MODES.map((mode) => [mode, fg, bg, min, use] as const)))(
    "contrast_%s_%s_on_%s_meetsMinimum",
    (mode, fg, bg, min, use) => {
      expect(t[fg], `--${fg} is not a token`).toBeDefined();
      expect(t[bg], `--${bg} is not a token`).toBeDefined();
      expect(contrast(t[fg][mode], t[bg][mode]), `${use} (${mode} mode)`).toBeGreaterThanOrEqual(min);
    },
  );

  it("themeColor_matchesPageBackgroundInBothModes", () => {
    expect({ light: t.chalk.light, dark: t.chalk.dark }).toEqual(THEME_COLOR);
  });
});

/** Files allowed to contain colour literals: the generated share image is a fixed picture, not a themed page. */
const LITERAL_ALLOWED = new Set(["src/app/og.png/route.tsx", "src/lib/theme.ts"]);
const COLOUR_LITERAL = /(?<![\w&/-])#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\b|\b(?:rgba?|hsla?)\(/gi;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe("no raw colours outside the token block", () => {
  it("sourceFiles_useTokensNotColourLiterals", () => {
    const offenders = sourceFiles(join(ROOT, "src")).flatMap((path) => {
      const rel = relative(ROOT, path);
      if (LITERAL_ALLOWED.has(rel)) return [];
      // The token block itself is where colours live.
      const text = path === CSS_PATH ? css.replace(tokenBlock(), "") : readFileSync(path, "utf8");
      return [...text.matchAll(COLOUR_LITERAL)].map((m) => `${rel}: ${m[0]}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe("storedTheme", () => {
  it("storedTheme_validChoice_isKept", () => {
    expect(storedTheme("dark")).toBe("dark");
  });

  it("storedTheme_missing_followsDevice", () => {
    expect(storedTheme(null)).toBeNull();
  });

  it("storedTheme_unexpectedValue_followsDevice", () => {
    expect(storedTheme("purple")).toBeNull();
  });
});

describe("effectiveTheme", () => {
  it("effectiveTheme_noChoiceDarkDevice_isDark", () => {
    expect(effectiveTheme(null, true)).toBe("dark");
  });

  it("effectiveTheme_lightChoiceOnDarkDevice_choiceWins", () => {
    expect(effectiveTheme("light", true)).toBe("light");
  });
});

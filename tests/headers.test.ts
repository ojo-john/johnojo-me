import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const headers = readFileSync(join(__dirname, "../public/_headers"), "utf8");

/** The Content-Security-Policy set by the rule for this path pattern. */
function cspFor(pattern: string): string | undefined {
  const block = headers.split(/\n(?=\S)/).find((b) => b.startsWith(`${pattern}\n`));
  return block?.match(/^ {2}Content-Security-Policy: (.*)$/m)?.[1];
}

describe("_headers", () => {
  it("adminPreviewCsp_matchesTheSitePolicy", () => {
    expect(cspFor("/admin/preview/*")).toBe(cspFor("/*"));
  });

  it("adminPreviewCsp_detachesTheEditorPolicy", () => {
    expect(headers).toMatch(/^\/admin\/preview\/\*\n {2}! Content-Security-Policy$/m);
  });
});

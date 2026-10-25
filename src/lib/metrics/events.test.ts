import { describe, expect, it } from "vitest";
import { parseEvent, toDataPoint, type ClickEvent } from "./events";

const view = (over: Record<string, unknown> = {}) => JSON.stringify({ type: "page_view", path: "/travel/", ref: "", ...over });
const click = (over: Record<string, unknown> = {}) => JSON.stringify({ type: "click", path: "/work/", label: "year: 2024", to: "", ...over });

describe("parseEvent", () => {
  it("parseEvent_notJson_returnsNull", () => {
    expect(parseEvent("{oops")).toBeNull();
  });

  it("parseEvent_jsonArray_returnsNull", () => {
    expect(parseEvent("[]")).toBeNull();
  });

  it("parseEvent_oversizedBody_returnsNull", () => {
    expect(parseEvent(view({ pad: "x".repeat(2000) }))).toBeNull();
  });

  it("parseEvent_unknownType_returnsNull", () => {
    expect(parseEvent(view({ type: "identify" }))).toBeNull();
  });

  it("parseEvent_fullUrlAsPath_returnsNull", () => {
    expect(parseEvent(view({ path: "https://evil.example/" }))).toBeNull();
  });

  it("parseEvent_protocolRelativePath_returnsNull", () => {
    expect(parseEvent(view({ path: "//evil.example/x" }))).toBeNull();
  });

  it("parseEvent_scriptInPath_returnsNull", () => {
    expect(parseEvent(view({ path: "/<script>" }))).toBeNull();
  });

  it("parseEvent_pathWithQueryAndHash_keepsPathOnly", () => {
    expect(parseEvent(view({ path: "/travel/?utm_source=x&email=a#top" }))).toEqual({ type: "page_view", path: "/travel/", ref: "" });
  });

  it("parseEvent_pathAtLimit_isAccepted", () => {
    expect(parseEvent(view({ path: "/" + "a".repeat(199) }))?.path).toHaveLength(200);
  });

  it("parseEvent_pathOverLimit_returnsNull", () => {
    expect(parseEvent(view({ path: "/" + "a".repeat(200) }))).toBeNull();
  });

  it("parseEvent_fullReferrerUrl_returnsNull", () => {
    expect(parseEvent(view({ ref: "https://google.com/search?q=john" }))).toBeNull();
  });

  it("parseEvent_referrerHost_isLowercasedWithoutWww", () => {
    expect(parseEvent(view({ ref: "WWW.Google.com" }))).toMatchObject({ ref: "google.com" });
  });

  it("parseEvent_missingReferrer_isEmpty", () => {
    expect(parseEvent(JSON.stringify({ type: "page_view", path: "/" }))).toEqual({ type: "page_view", path: "/", ref: "" });
  });

  it("parseEvent_clickWithoutLabel_returnsNull", () => {
    expect(parseEvent(click({ label: "   " }))).toBeNull();
  });

  it("parseEvent_labelWithEmail_returnsNull", () => {
    expect(parseEvent(click({ label: "mail someone@example.com" }))).toBeNull();
  });

  it("parseEvent_labelWithPhoneNumber_returnsNull", () => {
    expect(parseEvent(click({ label: "call 214 555 0100" }))).toBeNull();
  });

  it("parseEvent_labelWithMarkup_stripsIt", () => {
    expect(parseEvent(click({ label: "<b>Résumé</b>" }))).toMatchObject({ label: "b Résumé /b" });
  });

  it("parseEvent_longLabel_isCutTo80", () => {
    expect((parseEvent(click({ label: "word ".repeat(40) })) as ClickEvent).label.length).toBeLessThanOrEqual(80);
  });

  it("parseEvent_clickToJavascriptUrl_returnsNull", () => {
    expect(parseEvent(click({ to: "javascript:alert(1)" }))).toBeNull();
  });

  it("parseEvent_clickToExternalHost_isAccepted", () => {
    expect(parseEvent(click({ label: "GitHub ↗", to: "github.com" }))).toEqual({ type: "click", path: "/work/", label: "GitHub", to: "github.com" });
  });

  it("parseEvent_clickToInternalPath_isAccepted", () => {
    expect(parseEvent(click({ label: "Download PDF", to: "/resume.pdf" }))).toMatchObject({ to: "/resume.pdf" });
  });

  it("parseEvent_extraFields_areDropped", () => {
    expect(parseEvent(click({ userId: "abc", ip: "1.2.3.4" }))).toEqual({ type: "click", path: "/work/", label: "year: 2024", to: "" });
  });
});

describe("toDataPoint", () => {
  it("toDataPoint_click_usesStableColumnOrder", () => {
    expect(toDataPoint({ type: "click", path: "/work/", label: "year: 2024", to: "" })).toEqual({ blobs: ["click", "/work/", "year: 2024", ""], doubles: [1], indexes: ["click"] });
  });
});

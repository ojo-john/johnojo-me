import { describe, expect, it } from "vitest";
import { clickEvent, isOwnerDevice, OWNER_FLAG, referrerHost, sourceTag, trackingAllowed, withoutSourceTags, type TrackableElement } from "./tracker";

const loc = { pathname: "/work/", origin: "https://johnojo.me", host: "johnojo.me" };

/** A stand-in element: `closest` returns itself when it matches anything trackable. */
const el = (attrs: Record<string, string>, text = ""): TrackableElement => ({
  closest: () => (Object.keys(attrs).length || text ? self : null),
  getAttribute: (n) => attrs[n] ?? null,
  textContent: text,
});
let self: TrackableElement;
const clicked = (attrs: Record<string, string>, text = "") => {
  self = el(attrs, text);
  return clickEvent(self, loc);
};

describe("trackingAllowed", () => {
  it("trackingAllowed_doNotTrackOn_skips", () => {
    expect(trackingAllowed({ doNotTrack: "1" })).toBe(false);
  });

  it("trackingAllowed_globalPrivacyControlOn_skips", () => {
    expect(trackingAllowed({ doNotTrack: null, globalPrivacyControl: true })).toBe(false);
  });

  it("trackingAllowed_oldWindowDoNotTrack_skips", () => {
    expect(trackingAllowed({}, { doNotTrack: "1" })).toBe(false);
  });

  it("trackingAllowed_oldFirefoxYes_skips", () => {
    expect(trackingAllowed({ doNotTrack: "yes" })).toBe(false);
  });

  it("trackingAllowed_doNotTrackOff_tracks", () => {
    expect(trackingAllowed({ doNotTrack: "0", globalPrivacyControl: false })).toBe(true);
  });
});

describe("referrerHost", () => {
  it("referrerHost_empty_isEmpty", () => {
    expect(referrerHost("", "johnojo.me")).toBe("");
  });

  it("referrerHost_ownSite_isEmpty", () => {
    expect(referrerHost("https://johnojo.me/travel/", "johnojo.me")).toBe("");
  });

  it("referrerHost_otherSite_keepsHostOnly", () => {
    expect(referrerHost("https://www.google.com/search?q=john+ojo", "johnojo.me")).toBe("google.com");
  });
});

describe("clickEvent", () => {
  it("clickEvent_nothingTrackable_returnsNull", () => {
    expect(clickEvent(el({}), loc)).toBeNull();
  });

  it("clickEvent_mailtoLink_returnsNull", () => {
    expect(clicked({ href: "mailto:someone@example.com" }, "Email")).toBeNull();
  });

  it("clickEvent_dataTrack_winsOverText", () => {
    expect(clicked({ "data-track": "year: 2024" }, "2024")).toEqual({ type: "click", path: "/work/", label: "year: 2024", to: "" });
  });

  it("clickEvent_externalLink_recordsHostOnly", () => {
    expect(clicked({ href: "https://github.com/ojo-john/codequest?tab=readme" }, " GitHub ↗ ")).toEqual({ type: "click", path: "/work/", label: "GitHub ↗", to: "github.com" });
  });

  it("clickEvent_internalLink_recordsPathOnly", () => {
    expect(clicked({ href: "/travel/europe-2024/#porto" }, "Porto")).toMatchObject({ to: "/travel/europe-2024/" });
  });

  it("clickEvent_iconButton_usesAriaLabel", () => {
    expect(clicked({ "aria-label": "Close viewer" })).toMatchObject({ label: "Close viewer" });
  });
});

describe("trackingAllowed automation", () => {
  it("trackingAllowed_automatedBrowser_skips", () => {
    expect(trackingAllowed({ webdriver: true })).toBe(false);
  });
});

describe("isOwnerDevice", () => {
  it("isOwnerDevice_flagSet_isOwner", () => {
    expect(isOwnerDevice(() => ({ getItem: (k) => (k === OWNER_FLAG ? "1" : null) }))).toBe(true);
  });

  it("isOwnerDevice_noFlag_isVisitor", () => {
    expect(isOwnerDevice(() => ({ getItem: () => null }))).toBe(false);
  });

  it("isOwnerDevice_storageBlocked_isVisitor", () => {
    expect(
      isOwnerDevice(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
    ).toBe(false);
  });
});

describe("sourceTag", () => {
  it("sourceTag_refParam_isLowercased", () => {
    expect(sourceTag("?ref=LinkedIn")).toBe("linkedin");
  });

  it("sourceTag_utmSource_isUsedWhenNoRef", () => {
    expect(sourceTag("?utm_source=github")).toBe("github");
  });

  it("sourceTag_malformedTag_isEmpty", () => {
    expect(sourceTag("?ref=<script>")).toBe("");
  });

  it("sourceTag_noParams_isEmpty", () => {
    expect(sourceTag("")).toBe("");
  });
});

describe("withoutSourceTags", () => {
  it("withoutSourceTags_tagged_removesOnlyTheTags", () => {
    expect(withoutSourceTags("https://johnojo.me/travel/?ref=linkedin&x=1#porto")).toBe("/travel/?x=1#porto");
  });

  it("withoutSourceTags_untagged_isNull", () => {
    expect(withoutSourceTags("https://johnojo.me/travel/")).toBeNull();
  });
});

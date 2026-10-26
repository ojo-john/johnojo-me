import { describe, expect, it } from "vitest";
import { buildAdminMediaIndex, type AdminVisitInput } from "@/lib/content/admin-media";
import type { ManifestEntry } from "@/lib/content/media";

const photo = (takenAt: string, extra: Partial<ManifestEntry> = {}): ManifestEntry =>
  ({ type: "photo", w: 1000, h: 800, placeholder: "", takenAt, variants: [160, 480, 960].map((w) => ({ w, avif: `${w}.avif`, webp: `${w}.webp`, jpg: `${w}.jpg` })), ...extra }) as ManifestEntry;
const visit = (over: Partial<AdminVisitInput> = {}): AdminVisitInput => ({ trip: "t", visitSlug: "porto", folder: "porto", hiddenFiles: new Set(), ...over });

describe("admin media index", () => {
  it("buildAdminMediaIndex_hiddenAndDuplicatePhotos_areListedButFlagged", () => {
    const items = { "t/porto/photos/a": photo("2024-01-01"), "t/porto/photos/b": photo("2024-01-02", { duplicateOf: "t/porto/photos/a" }) };
    const index = buildAdminMediaIndex(items, [visit({ hiddenFiles: new Set(["photos/a"]) })]);
    expect(index.visits["t--porto"].map((p) => [p.file, p.hidden, p.duplicate])).toEqual([["photos/a", true, false], ["photos/b", false, true]]);
  });

  it("buildAdminMediaIndex_tripScope_prefixesEachPhotoWithItsFolder", () => {
    const items = { "t/porto/photos/a": photo("2024-01-01"), "t/nice-riviera/photos/c": photo("2024-01-03") };
    const index = buildAdminMediaIndex(items, [visit(), visit({ visitSlug: "nice", folder: "nice-riviera" })]);
    expect(index.trips.t.map((p) => p.file)).toEqual(["porto/photos/a", "nice-riviera/photos/c"]);
  });

  it("buildAdminMediaIndex_visitWithNoPhotos_getsEmptyListNotMissing", () => {
    const index = buildAdminMediaIndex({}, [visit()]);
    expect(index.visits["t--porto"]).toEqual([]);
  });

  it("buildAdminMediaIndex_thumbnail_usesSmallestSharpVariant", () => {
    const index = buildAdminMediaIndex({ "t/porto/photos/a": photo("2024-01-01") }, [visit()]);
    expect(index.visits["t--porto"][0].thumb).toBe("480.jpg");
  });
});

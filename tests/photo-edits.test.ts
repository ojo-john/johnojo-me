import { describe, expect, it } from "vitest";
import { applyOrder, editSignature, formatPhotoEdits, parseCrop, parsePhotoEdits, parseTrim } from "@/lib/content/photo-edits";

describe("photo edits", () => {
  it("parsePhotoEdits_emptyOrMissing_returnsNoEdits", () => {
    expect(parsePhotoEdits(undefined)).toEqual({ edits: {}, order: [], problems: [] });
  });

  it("parsePhotoEdits_rotateAndCrop_parsesBoth", () => {
    expect(parsePhotoEdits("photos/img-1 rotate=90 crop=10,5,80,70").edits).toEqual({ "photos/img-1": { rotate: 90, crop: { x: 10, y: 5, w: 80, h: 70 } } });
  });

  it("parsePhotoEdits_bareFileName_isTreatedAsAPhoto", () => {
    expect(Object.keys(parsePhotoEdits("img-2 rotate=180").edits)).toEqual(["photos/img-2"]);
  });

  it("parsePhotoEdits_badValue_skipsItAndReportsIt", () => {
    const r = parsePhotoEdits("photos/img-1 rotate=45\nphotos/img-2 rotate=270");
    expect([Object.keys(r.edits), r.problems.length]).toEqual([["photos/img-2"], 1]);
  });

  it("parseCrop_tinyOrOutOfBounds_isRejected", () => {
    expect([parseCrop("0,0,2,50"), parseCrop("60,0,50,50"), parseCrop("a,b,c,d")]).toEqual([null, null, null]);
  });

  it("parseCrop_fullFrame_isNoCrop", () => {
    expect(parseCrop("0,0,100,100")).toBeNull();
  });

  it("formatPhotoEdits_roundTrip_isStableAndSorted", () => {
    const text = "photos/img-b crop=1.25,2,50,60\nphotos/img-a rotate=90";
    expect(formatPhotoEdits(parsePhotoEdits(text).edits)).toBe("photos/img-a rotate=90\nphotos/img-b crop=1.3,2,50,60");
  });

  it("editSignature_noEdit_isEmpty", () => {
    expect([editSignature(undefined), editSignature({ rotate: 90, crop: { x: 1, y: 2, w: 3, h: 4 } })]).toEqual(["", "r90c1,2,3,4"]);
  });
});

describe("media manager edits", () => {
  it("parsePhotoEdits_trimHideDeleteAndOrder_areParsed", () => {
    const r = parsePhotoEdits("order: videos/v1, photos/a\nvideos/v1 trim=1.5,9\nphotos/a hide # blurry\nphotos/b delete");
    expect([r.order, r.edits]).toEqual([["videos/v1", "photos/a"], { "videos/v1": { trim: { start: 1.5, end: 9 } }, "photos/a": { hide: true }, "photos/b": { delete: true } }]);
  });

  it("parseTrim_endBeforeStartOrTooShort_isRejected", () => {
    expect([parseTrim("5,2"), parseTrim("1,1.2"), parseTrim("x,2")]).toEqual([null, null, null]);
  });

  it("formatPhotoEdits_withOrder_writesOrderLineFirst", () => {
    expect(formatPhotoEdits({ "photos/a": { hide: true } }, ["photos/a", "photos/b"])).toBe("order: photos/a, photos/b\nphotos/a hide");
  });

  it("editSignature_hideAndDelete_dontForceAReprocess", () => {
    expect(editSignature({ hide: true, delete: true })).toBe("");
  });

  it("applyOrder_unlistedItems_keepTheirPlaceAfterListedOnes", () => {
    const items = ["a", "b", "c", "d"].map((key) => ({ key }));
    expect(applyOrder(items, ["c", "a"]).map((i) => i.key)).toEqual(["c", "a", "b", "d"]);
  });

  it("applyOrder_noOrder_returnsItemsUnchanged", () => {
    const items = [{ key: "x" }, { key: "y" }];
    expect(applyOrder(items, [])).toEqual(items);
  });
});

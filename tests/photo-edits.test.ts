import { describe, expect, it } from "vitest";
import { editSignature, formatPhotoEdits, parseCrop, parsePhotoEdits } from "@/lib/content/photo-edits";

describe("photo edits", () => {
  it("parsePhotoEdits_emptyOrMissing_returnsNoEdits", () => {
    expect(parsePhotoEdits(undefined)).toEqual({ edits: {}, problems: [] });
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

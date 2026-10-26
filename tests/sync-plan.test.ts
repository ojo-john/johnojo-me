import { describe, expect, it } from "vitest";
import { mediaId, originalKeyToId, sourceKey } from "../scripts/lib/ids";
import { planBackup, planPublish, planPull } from "../scripts/lib/sync-plan";

const obj = (key: string, etag = "aaa", size = 10) => ({ key, etag, size });

describe("planPublish", () => {
  it("planPublish_emptyBucket_uploadsEverythingLocal", () => {
    const plan = planPublish(new Map([["media/a.jpg", "m1"]]), []);
    expect([plan.upload, plan.remove, plan.missing]).toEqual([["media/a.jpg"], [], []]);
  });

  it("planPublish_sameContentInBucket_isUnchanged", () => {
    expect(planPublish(new Map([["media/a.jpg", "m1"]]), [obj("media/a.jpg", "m1")]).unchanged).toBe(1);
  });

  it("planPublish_changedContent_isReuploaded", () => {
    expect(planPublish(new Map([["media/a.jpg", "new"]]), [obj("media/a.jpg", "old")]).upload).toEqual(["media/a.jpg"]);
  });

  it("planPublish_notLocalButAlreadyInBucket_isKept", () => {
    const plan = planPublish(new Map([["media/a.jpg", null]]), [obj("media/a.jpg")]);
    expect([plan.unchanged, plan.missing]).toEqual([1, []]);
  });

  it("planPublish_notLocalAndNotInBucket_isMissing", () => {
    expect(planPublish(new Map([["media/a.jpg", null]]), []).missing).toEqual(["media/a.jpg"]);
  });

  it("planPublish_hiddenPhotoStillInBucket_isRemoved", () => {
    expect(planPublish(new Map(), [obj("media/hidden.jpg")]).remove).toEqual(["media/hidden.jpg"]);
  });

  it("planPublish_objectsOutsideMediaPrefix_areLeftAlone", () => {
    expect(planPublish(new Map(), [obj("other/file.txt")]).remove).toEqual([]);
  });
});

describe("planPull", () => {
  const key = "utah-2025/Salt Lake City/photos/IMG_1.JPG";
  const id = mediaId("utah-2025", "Salt Lake City", "photos", "IMG_1.JPG");

  it("planPull_neverProcessed_isDownloaded", () => {
    expect(planPull([obj(key)], {}, {})).toEqual([key]);
  });

  it("planPull_alreadyProcessedFromTheseBytes_isSkipped", () => {
    expect(planPull([obj(key, "e1", 5)], { [id]: sourceKey(5, "e1", undefined) }, {})).toEqual([]);
  });

  it("planPull_editChangedSinceProcessing_isDownloadedAgain", () => {
    expect(planPull([obj(key, "e1", 5)], { [id]: sourceKey(5, "e1", undefined) }, { [id]: { rotate: 90 } })).toEqual([key]);
  });

  it("planPull_editorPreviewsAndStrayObjects_areIgnored", () => {
    expect(planPull([obj("_previews/x.jpg"), obj("trip/city/photos/notes.txt"), obj("trip/_old/photos/a.jpg")], {}, {})).toEqual([]);
  });
});

describe("planBackup", () => {
  it("planBackup_newAndChangedFiles_areSentButNothingIsDeleted", () => {
    const local = new Map([["t/c/photos/a.jpg", { size: 1, md5: "same" }], ["t/c/photos/b.jpg", { size: 1, md5: "new" }]]);
    expect(planBackup(local, [obj("t/c/photos/a.jpg", "same"), obj("t/c/photos/only-in-bucket.jpg")])).toEqual(["t/c/photos/b.jpg"]);
  });
});

describe("originalKeyToId", () => {
  it("originalKeyToId_pathTraversal_isRejected", () => {
    expect(originalKeyToId("../c/photos/a.jpg")).toBeNull();
  });

  it("originalKeyToId_videoInVideosFolder_mapsToItsId", () => {
    expect(originalKeyToId("aruba-2026/aruba/videos/IMG_0345.MOV")).toEqual({ id: "aruba-2026/aruba/videos/img-0345", kind: "videos" });
  });
});

import { describe, expect, it } from "vitest";
import { mediaId, originalKeyToId, sourceKey } from "../scripts/lib/ids";
import { idsMissingWebCopies, planBackup, planDeletes, planPublish, planPull, webCopyOwners } from "../scripts/lib/sync-plan";

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

  it("planPull_webCopiesMissing_isDownloadedAgainThoughUnchanged", () => {
    expect(planPull([obj(key, "e1", 5)], { [id]: sourceKey(5, "e1", undefined) }, {}, new Set([id]))).toEqual([key]);
  });

  it("planPull_webCopiesMissingButDeletedInEditor_isNotDownloaded", () => {
    expect(planPull([obj(key)], {}, { [id]: { delete: true } }, new Set([id]))).toEqual([]);
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

describe("planDeletes", () => {
  const key = "trip/city/videos/IMG_9.MOV";
  const id = mediaId("trip", "city", "videos", "IMG_9.MOV");

  it("planDeletes_deletedInEditor_isMovedAndNotPulled", () => {
    const edits = { [id]: { delete: true } };
    expect([planDeletes([obj(key)], edits), planPull([obj(key)], {}, edits)]).toEqual([[key], []]);
  });

  it("planDeletes_nothingDeleted_isEmpty", () => {
    expect(planDeletes([obj(key)], {})).toEqual([]);
  });

  it("planPull_videoTrimChanged_isDownloadedAgain", () => {
    expect(planPull([obj(key, "e", 5)], { [id]: sourceKey(5, "e", undefined) }, { [id]: { trim: { start: 1, end: 5 } } })).toEqual([key]);
  });
});

describe("idsMissingWebCopies", () => {
  const owners = webCopyOwners({
    "t/c/photos/a": { variants: [{ avif: "/media/t/c/photos/a-160.avif", webp: "/media/t/c/photos/a-160.webp", jpg: "/media/t/c/photos/a-160.jpg" }] },
    "t/c/videos/v": { src: "https://media.example/media/t/c/videos/v.mp4", poster: "/media/t/c/videos/v-poster.jpg" },
  });

  it("idsMissingWebCopies_oneSizeMissing_remakesThatPhoto", () => {
    const wanted = ["media/t/c/photos/a-160.avif", "media/t/c/photos/a-160.webp", "media/t/c/photos/a-160.jpg"];
    expect(idsMissingWebCopies(wanted, new Set(wanted.slice(0, 2)), owners)).toEqual(new Set(["t/c/photos/a"]));
  });

  it("idsMissingWebCopies_everythingStored_isEmpty", () => {
    const wanted = ["media/t/c/videos/v.mp4", "media/t/c/videos/v-poster.jpg"];
    expect(idsMissingWebCopies(wanted, new Set(wanted), owners).size).toBe(0);
  });

  it("idsMissingWebCopies_keyNotInManifest_isIgnored", () => {
    expect(idsMissingWebCopies(["media/x/y/photos/z-160.jpg"], new Set(), owners).size).toBe(0);
  });
});

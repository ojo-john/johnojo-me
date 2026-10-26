import { describe, expect, it } from "vitest";
import { videoDateFrom } from "../scripts/lib/video-date";

describe("videoDateFrom", () => {
  it("videoDateFrom_iphoneClip_prefersAppleLocalCaptureTimeOverExportTime", () => {
    const info = "creation_time   : 2026-10-25T23:54:40.000000Z\n    com.apple.quicktime.creationdate: 2026-10-25T12:31:39+0100";
    expect(videoDateFrom(info)).toBe("2026-10-25T12:31:39");
  });

  it("videoDateFrom_onlyGenericTime_usesIt", () => {
    expect(videoDateFrom("    creation_time   : 2025-07-06T02:25:53.000000Z")).toBe("2025-07-06T02:25:53");
  });

  it("videoDateFrom_noDateTags_returnsNull", () => {
    expect(videoDateFrom("Stream #0:0: Video: h264")).toBeNull();
  });

  it("videoDateFrom_garbageDate_returnsNull", () => {
    expect(videoDateFrom("creation_time : not-a-date")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/lib/content/media";
import { publicMediaKeys } from "@/lib/content/public-media";

const photo = (stem: string): MediaItem =>
  ({ type: "photo", id: stem, caption: null, alt: "", w: 1, h: 1, placeholder: "", takenAt: null, variants: [{ w: 480, avif: `/media/${stem}-480.avif`, webp: `/media/${stem}-480.webp`, jpg: `/media/${stem}-480.jpg` }] }) as MediaItem;
const video = (stem: string, poster = `/media/${stem}-poster.jpg`): MediaItem =>
  ({ type: "video", id: stem, caption: null, alt: "", w: 1, h: 1, takenAt: null, src: `/media/${stem}.mp4`, poster }) as MediaItem;

describe("publicMediaKeys", () => {
  it("publicMediaKeys_noTrips_isEmpty", () => {
    expect(publicMediaKeys([]).size).toBe(0);
  });

  it("publicMediaKeys_photo_includesEveryFormatAsBucketKeys", () => {
    expect([...publicMediaKeys([{ visits: [{ photos: [photo("t/a")], videos: [] }] }])].sort()).toEqual(["media/t/a-480.avif", "media/t/a-480.jpg", "media/t/a-480.webp"]);
  });

  it("publicMediaKeys_videoWithoutPoster_includesOnlyTheClip", () => {
    expect([...publicMediaKeys([{ visits: [{ photos: [], videos: [video("t/v", "")] }] }])]).toEqual(["media/t/v.mp4"]);
  });

  it("publicMediaKeys_urlsAlreadyOnTheMediaDomain_areStrippedToKeys", () => {
    const onR2 = { ...video("t/v"), src: "https://media.johnojo.me/media/t/v.mp4", poster: "https://media.johnojo.me/media/t/v-poster.jpg" } as MediaItem;
    expect([...publicMediaKeys([{ visits: [{ photos: [], videos: [onR2] }] }])].sort()).toEqual(["media/t/v-poster.jpg", "media/t/v.mp4"]);
  });
});

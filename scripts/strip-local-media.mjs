// Runs after `next build`. When MEDIA_BASE_URL is set, photos and clips are served from R2, so the local
// copies Next copied out of public/media are removed from out/: they'd otherwise ship every processed
// file (hidden ones included) to the static host. Without MEDIA_BASE_URL (local preview), out/ keeps them.
import fs from "node:fs";
import path from "node:path";

const media = path.join(process.cwd(), "out", "media");
if (process.env.MEDIA_BASE_URL && fs.existsSync(media)) {
  fs.rmSync(media, { recursive: true, force: true });
  console.log("Removed out/media: media is served from " + process.env.MEDIA_BASE_URL);
}

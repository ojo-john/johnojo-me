# Photos and videos

Originals live in **`~/workspace/johnojo-media`** (outside the code, never uploaded):

```
johnojo-media/<trip>/<city>/photos/   IMG_1234.HEIC, IMG_1235.jpg …
johnojo-media/<trip>/<city>/videos/   IMG_1240.MOV …
johnojo-media/<trip>/<city>/notes.md  your notes (optional)
```

Folder names become ids: `europe-2027`, `nice + french riviera` → `nice-french-riviera`.

## Process them

```
npm run media
```

For each new or changed file it:

- converts iPhone HEIC, fixes rotation, and makes AVIF + WebP + JPEG copies at up to four widths
  (480–2400 px) with a tiny blurred placeholder;
- **strips all metadata**: GPS location, camera serials and other EXIF never reach the site. Only the
  time the photo was taken is kept (in `content/media-manifest.json`) to order photos and match football
  fixtures;
- compresses clips to 720p H.264 with a poster frame (uses macOS `avconvert`).

It skips files it has already done, so re-running after adding a few photos is quick. Deleted originals
are removed from the site on the next run. One bad file never stops the rest.

## Rules of thumb

- **Clips over 25 MB after compressing are skipped** (Cloudflare's per-file limit). Trim them in the
  Photos app, or upload to YouTube as **unlisted** and add the video id under *YouTube videos* in the
  city's visit.
- Don't add screenshots of tickets, QR codes, booking emails, passports or boarding passes.
- Photos with other people's faces: hide any they wouldn't want online (*Photo captions → Hide this photo*).
- Captions and screen-reader descriptions go in the visit's *Photo captions*; the cover photo is
  `photos/img-1234` (file name, lower-case, no extension).
- Only use your own photos, or ones you have permission for.

## Where processed files go

`public/media/` (git-ignored, about 500 MB and growing). At deploy they're uploaded to Cloudflare R2,
which is free up to 10 GB of storage with no charge for people viewing them. Large video collections
are what fill that up, which is another reason to put long videos on YouTube.

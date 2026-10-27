# Photos and videos

## How it works once live

1. **Upload**: Editor → "Upload photos" (or `/admin/upload/`). Pick the city, choose files, press Upload.
   Originals go to the private R2 bucket (`R2_ORIGINALS_BUCKET`) through `/api/upload`, behind the admin login.
2. **Process and publish**: press the button. `/api/process` starts the "Process media" GitHub Action, which:
   downloads only new or edited originals → resizes, applies rotate/crop, finds faces, strips metadata →
   uploads the visible web copies to the public bucket (`R2_BUCKET`, served at `media.johnojo.me`) and deletes
   hidden ones → commits `content/media-manifest.json` → Cloudflare Pages rebuilds.
3. **Edit** in the editor. Each city visit has **Photos & videos**: drag to reorder, Show/Hide, Delete (the
   original moves to `_deleted/`, recoverable), rotate and crop photos, trim clips (including ones too big to
   publish). Captions live in "Photo captions"; covers and framing in "Cover photo" / "Cover framing".
   Saving a visit re-runs the job automatically when a photo or clip needs re-making.

Nothing needs to stay on your Mac. Folders whose names start with `_` are never published.

## Local commands (optional)

| Command | What it does |
|---|---|
| `npm run media` | Process the media folder locally (`~/workspace/johnojo-media`) |
| `npm run media:publish` | Process, back up originals, publish visible copies, all in one |
| `npm run media:upload -- --dry-run` | Show what would be published or removed |
| `npm run media:backup -- --dry-run` | Show which originals aren't backed up yet |

## One-time setup (needs John's accounts)

1. **R2**: create two buckets, `johnojo-media` (public, custom domain `media.johnojo.me`) and
   `johnojo-originals` (private, no public access). Create one API token: Object Read & Write, these two buckets.
2. **Local**: put `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ORIGINALS_BUCKET`
   in `.env.local` (git-ignored). Then `npm run media:publish` once to send everything up.
3. **GitHub** repo → Settings → Secrets → Actions: the same five values.
4. **Cloudflare Pages** project:
   - Build env: `MEDIA_BASE_URL=https://media.johnojo.me`.
   - Bindings: R2 bucket `ORIGINALS` → `johnojo-originals`, and R2 bucket `MEDIA` → `johnojo-media` (only listed,
     for the storage budget; uploads refuse to run without it).
   - Variables: `GITHUB_REPO=ojo-john/johnojo-me`; secret `GITHUB_DISPATCH_TOKEN` = a fine-grained GitHub token
     for that repo only, with "Contents: read and write" (repository_dispatch needs it).
   - `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` as for metrics.
5. **Cloudflare Access**: the "johnojo.me admin" application must cover `/admin/*`, `/api/upload`,
   `/api/process` and `/api/preview/*` (and `/api/metrics`). The functions also verify the Access token and deny
   without it.

## Limits

- Uploads through the admin page: any size up to 5 GB. Files over 90 MB go up in 50 MB parts (Cloudflare's free plan
  caps one request at 100 MB). A file name already taken in that city is saved as name-2, name-3… (never overwritten).
- Storage stops at 8 GB across both buckets, to stay inside R2's free 10 GB. See "Staying on the free tier" in
  [DEPLOY.md](DEPLOY.md); `npm run media:usage` shows where it stands.
- Web clips over 25 MB after compression stay off the site, listed in the editor as "too long: trim" until trimmed.
- The "Process media" job runs on every visit save (to catch rotate/crop/trim edits). A save with nothing to process
  finishes in about a minute.
- The Cloudflare Pages build fails on purpose if `MEDIA_BASE_URL` isn't set, rather than publishing broken images.
- GitHub Actions on a private repo: 2,000 free minutes a month; a run takes a few minutes.

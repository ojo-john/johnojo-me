# Deploying johnojo.me

Static build on **Cloudflare Pages** (free), photos and clips on **Cloudflare R2** (free up to
10 GB), domain on **Cloudflare Registrar**. No server, no database.

## One-time setup

1. **GitHub**: push this repo to a private repository (e.g. `ojo-john/johnojo-me`). The editor's
   `public/admin/config.yml` points at that name.
2. **R2 bucket for media**: Cloudflare dashboard → R2 → Create bucket `johnojo-media` →
   Settings → Custom domains → connect `media.johnojo.me`.
   Then R2 → Manage API tokens → create an *Object Read & Write* token for that bucket only, and put
   it in `.env.local` (git-ignored):
   ```
   R2_ACCOUNT_ID=…
   R2_ACCESS_KEY_ID=…
   R2_SECRET_ACCESS_KEY=…
   R2_BUCKET=johnojo-media
   ```
   Upload everything: `npm run media:upload`.
3. **Pages project**: Workers & Pages → Create → Pages → Connect to Git → choose the repo.
   - Build command: `npm run build`
   - Output directory: `out`
   - Environment variables: `NODE_VERSION=24`, `MEDIA_BASE_URL=https://media.johnojo.me`,
     and (optional) `NEXT_PUBLIC_CF_BEACON_TOKEN` for Web Analytics.
4. **Domain**: Pages project → Custom domains → add `johnojo.me` (and `www.johnojo.me`). Because the
   domain is registered with Cloudflare, DNS and HTTPS are set up automatically.
5. **Budget alerts**: Billing → Notifications → set an alert on R2 usage, so nothing is ever charged
   without warning.

## Publishing changes

- **Content or code**: commit and push to `main`. Cloudflare rebuilds and publishes in a minute or two.
  Pull requests get their own preview URL.
- **New photos**: `npm run media`, then `npm run media:upload`, then commit `content/media-manifest.json`
  together with the content that uses the photos.

## Costs (check current prices)

| Item | Cost |
|---|---|
| Domain (.me) | yearly renewal, shown in Cloudflare Registrar |
| Pages hosting, builds, HTTPS | free tier (500 builds/month) |
| R2 storage | free up to 10 GB a month, then usage-based; no charge for people viewing |
| Web Analytics | free |

## Security

- `public/_headers` sets a Content Security Policy, HSTS, no framing, and long caching for hashed assets.
  The editor at `/admin/` gets its own wider policy and is excluded from search engines.
- Only GitHub accounts with write access to the repo can save through the editor.
- No secrets are in the repo: R2 keys live in `.env.local` (git-ignored) and in Cloudflare's settings.

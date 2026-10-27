# Deploying johnojo.me

Static build on **Cloudflare Pages** (free), photos and clips on **Cloudflare R2** (free up to
10 GB), domain on **Cloudflare Registrar**. No server, no database.

## One-time setup

1. **GitHub**: push this repo to a private repository (e.g. `ojo-john/johnojo-me`). The editor's
   `public/admin/config.yml` points at that name.
2. **R2 bucket for media**: Cloudflare dashboard → R2 → Create bucket `johnojo-media` →
   Settings → Custom domains → connect `media.johnojo.me`.
   `.env.local` (git-ignored) names the account and buckets; the commands use your Cloudflare sign-in
   (`npx wrangler login`), so no key is needed locally (see [MEDIA.md](MEDIA.md)).
   Upload everything: `npm run media:backup && npm run media:upload`.
3. **Pages project**: Workers & Pages → Create → Pages → Connect to Git → choose the repo.
   - Build command: `npm run build`
   - Output directory: `out`
   - Environment variables: `NODE_VERSION=24`, `MEDIA_BASE_URL=https://media.johnojo.me`,
     and (optional) `NEXT_PUBLIC_CF_BEACON_TOKEN` for Web Analytics.
   - The `functions/` folder (the site-metrics API) is deployed automatically with the site. It stays
     switched off until you do the steps in [METRICS.md](METRICS.md).
4. **Domain**: Pages project → Custom domains → add `johnojo.me` (and `www.johnojo.me`). Because the
   domain is registered with Cloudflare, DNS and HTTPS are set up automatically.
5. **Budget alerts**: Billing → Notifications → set an alert on R2 usage, so nothing is ever charged
   without warning.

## Staying on the free tier

Everything runs on free plans. Only R2 storage can ever bill, so it has guardrails in code and in the account:

| Guardrail | Where |
|---|---|
| Storage budget: 8 GB across both buckets (free tier is 10 GB). The upload page, `npm run media:upload` and `npm run media:backup` measure both buckets first and refuse anything that would go over; if storage can't be measured, they refuse too. Deleting is always allowed. | `src/lib/media-admin/budget.ts` |
| `npm run media:usage` shows usage per bucket against the budget. | `scripts/storage-usage.ts` |
| Buckets use the Standard storage class (Infrequent Access isn't in the free tier and charges per read). | R2, set at creation |
| Abandoned multipart uploads are deleted after 1 day, so half-finished clips never sit there taking space. | R2 lifecycle rule `abort-stale-uploads` |
| Hidden photos, duplicates and drafts are never uploaded to the public bucket. | `npm run media:upload` |
| Web copies are sent with a week-long cache header, so repeat views are served by Cloudflare's cache, not read from R2. | `scripts/upload-media.ts` |
| Workers Free plan: Pages Functions stop at 100,000 requests a day instead of charging. Keep the account on Workers **Free**. | Dashboard → Workers & Pages → Plans |
| Billing alert on R2 usage, and no paid plan or add-on switched on. | Dashboard → Notifications (see step 5 above) |

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
| Site metrics (Pages Functions + Analytics Engine) | free tier (100,000 function requests and events a day) |

## The editor online (owner-only)

The editor at `/admin/` is locked in three layers. Each one alone keeps visitors out; together they mean
a mistake in one doesn't open the door.

| Layer | What it stops | Where |
|---|---|---|
| 1. Cloudflare Access | Nobody but you can even load `/admin/` (or `/api/metrics`) | Cloudflare Zero Trust |
| 2. GitHub sign-in | The editor can read and save only with a GitHub login that has write access | Sveltia + GitHub |
| 3. Private repo, one collaborator | Even a GitHub login can't save unless it's yours | GitHub repo settings |

On your own computer none of this applies: `npm run dev`, open <http://localhost:3000/admin/> in Chrome
and choose **Work with Local Repository**. It edits the files on your disk and needs no login, because
nothing leaves your machine.

### Layer 3: the repository

- Keep `ojo-john/johnojo-me` **private**, with you as the only collaborator
  (Settings → Collaborators should list nobody else).
- Turn on two-factor authentication for your GitHub account.

### Layer 2: signing in to the editor

The editor offers two ways in. Either works; you only need one.

**Option A: personal access token (simplest, nothing to host).**

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** →
   Generate new token.
2. Name `johnojo.me editor`, expiry 90 days (set a reminder to renew), Resource owner: you.
3. Repository access: **Only select repositories** → `ojo-john/johnojo-me`.
4. Repository permissions: **Contents: Read and write**. Leave everything else at *No access*
   (Metadata: read is added automatically).
5. Generate, copy the token, open `https://johnojo.me/admin/`, choose **Sign In Using Access Token**
   and paste it. It's kept in that browser only. Never put the token in the repo or in chat.
6. Lost the laptop or think the token leaked? Delete it on the same GitHub page; it stops working at once.

**Option B: "Sign in with GitHub" button (needs a small free relay).**

GitHub's sign-in needs a server to hold a client secret. Sveltia's own relay,
[sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth), runs free on Cloudflare Workers.

1. Cloudflare dashboard → Workers & Pages → Create → deploy `sveltia-cms-auth` from its README
   ("Deploy to Cloudflare" button, or clone it and run `npx wrangler deploy`). Note the worker URL, e.g.
   `https://sveltia-cms-auth.<your-subdomain>.workers.dev`.
2. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App:
   - Application name: `johnojo.me editor`
   - Homepage URL: `https://johnojo.me`
   - Authorization callback URL: `<worker URL>/callback`
   Register, copy the **Client ID**, generate a **Client secret** and copy it.
3. In the worker's Settings → Variables and secrets add:
   - `GITHUB_CLIENT_ID` = the client ID
   - `GITHUB_CLIENT_SECRET` = the secret (type **Secret**)
   - `ALLOWED_DOMAINS` = `johnojo.me` (so only your site can use the relay)
4. In `public/admin/config.yml`, uncomment `base_url:` under `backend` and set it to the worker URL.
   Commit and push.
5. The Content Security Policy needs no change: the sign-in opens a popup on the worker and the answer
   comes back by `postMessage`, so the editor page never fetches from the worker.

### Layer 1: Cloudflare Access in front of /admin/ (recommended)

Free for up to 50 users on the Zero Trust free plan.

1. Cloudflare dashboard → **Zero Trust** (pick the Free plan if asked; it needs a card on file but
   doesn't charge). Choose a team name; it becomes `<team>.cloudflareaccess.com`.
2. Settings → Authentication → Login methods: **One-time PIN** is on by default. Optionally add
   **GitHub** as a login method too.
3. Access → Applications → **Add an application** → Self-hosted:
   - Application name: `johnojo.me admin`
   - Session duration: 24 hours
   - Public hostnames: domain `johnojo.me` with path `admin/*`, and domain `johnojo.me` with path `api/*`.
   - Access can't protect `*.pages.dev` (not our domain), so the site does it: `functions/admin/_middleware.ts`
     redirects `/admin/*` on any other host (pages.dev, previews, www) to `https://$SITE_HOST/admin/…`, and on
     the real host verifies the Access token itself before serving any admin file. The `/api/*` functions verify
     it too, so on pages.dev they answer 403.
4. Add a policy: name `Only me`, action **Allow**, Include → **Emails** → `<your email>`.
   No other rules. Anyone else gets Cloudflare's login page and can't get past it.
5. Save. Open `https://johnojo.me/admin/` in a private window: you should see Cloudflare's login page,
   get a PIN by email, and only then the editor.
6. Pages project → Settings → Variables: `SITE_HOST` = `johnojo.me`, `ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com`,
   `ACCESS_AUD` = the tag below. Without all three, `/admin/*` serves nothing (fails closed).
7. Copy the application's **Application Audience (AUD) tag** (Access → Applications → the app →
   Overview). The metrics API checks it; see [METRICS.md](METRICS.md).

Your email lives only in Cloudflare's settings, never in this repository.

### Keeping /admin/ out of search engines

`robots.txt` disallows `/admin/`, `public/_headers` sends `X-Robots-Tag: noindex` for it, and
The admin pages (`public/admin/index.html` dashboard, `public/admin/editor/index.html` editor) have `<meta name="robots" content="noindex">`. Behind Access, crawlers can't
reach it anyway.

## Security

- `public/_headers` sets a Content Security Policy, HSTS, no framing, and long caching for hashed assets.
  The editor at `/admin/` gets its own wider policy (the site-wide one is detached first with `!`,
  because Cloudflare would otherwise apply both and block the editor) and is excluded from search engines.
- Only GitHub accounts with write access to the repo can save through the editor, and Cloudflare Access
  keeps everyone else from loading it (see "The editor online" above).
- No secrets are in the repo: R2 keys live in `.env.local` (git-ignored) and in Cloudflare's settings,
  and the metrics API token is a Pages secret.
- `/api/metrics` sits behind the same Cloudflare Access application as `/admin/*`, and checks the Access
  token itself, so it stays closed even if the Access app were removed (see [METRICS.md](METRICS.md)).

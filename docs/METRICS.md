# Site metrics

The site counts its own page views and clicks, and you read them at `/admin/metrics/` (also linked as
**Site metrics** in the editor's toolbar). Nothing is set up yet: it all switches on when the site is
deployed and the steps below are done.

## What is counted

| Event | What's stored | Example |
|---|---|---|
| Page view | the page path, and the host of the site the visitor came from (first page only) | `/travel/europe-2024/`, `google.com` |
| Click | the page, the name of the button or link, and where a link goes (a path on this site or another site's host) | `/work/`, `year: 2024`; `/`, `GitHub ↗`, `github.com` |

Named clicks include: `résumé: open`, `jump to: open` and each **Jump to** choice (`jump to: Trip · Europe 2024`,
the typed search text is never sent), `trip year: …`, `city: …` (map pins), `lightbox: open`, `clip: open`,
`video: play`, `year: …` (Work page timeline), `skill: …` and `rankings: …`. Other links and buttons are
counted by their visible name. Downloads such as `/resume.pdf` show up under **Links followed**.

The admin page shows, for the last 7 or 30 days: total views and clicks, views per day, top pages, top
clicks, links followed and referring sites. The API also returns views per page per day.

## Privacy

- **No cookies, no browser storage, no identifiers.** Each event is a path or a button name. There is
  nothing that ties two events to the same person.
- **No personal data.** No IP addresses are stored (the IP is used only in memory to slow down floods,
  then forgotten), no full referrer URLs or query strings, no form contents, no user agents. Labels
  that look like an email address or a phone number are refused by the server.
- **Do Not Track and Global Privacy Control are respected.** The tracker sends nothing when either is on,
  and the server drops events that arrive with those signals anyway.
- **Aggregates only, and they expire.** Analytics Engine keeps data for three months, then deletes it.
- **No third-party script.** The tracker is part of the site's own code (under 1 KB compressed) and
  talks only to `/hit` on the same domain.

Because nothing is stored on the visitor's device and nobody is identified or followed, this needs no
cookie banner or consent prompt (the ePrivacy "cookie" rule covers storing or reading things on the
device, and the counts aren't personal data under GDPR). Say so in a short line on the site if you like:
"This site counts page views without cookies or personal data."

## How it works

```
page (src/components/Metrics.tsx)
  └─ navigator.sendBeacon → POST /hit  (functions/hit/index.ts; outside /api/* so Access never blocks visitors)
        checks: metrics on, same-site Origin, not DNT/GPC, not a bot, ≤ 1 KB, rate limit, valid event
        └─ Workers Analytics Engine dataset "johnojo_metrics"

/admin/metrics/ (public/admin/metrics/)
  └─ GET /api/metrics?days=7|30  (functions/api/metrics.ts)
        Cloudflare Access in front + the function verifies the Access token (fails closed)
        └─ Analytics Engine SQL API (read-only token) → JSON
```

- The checks and queries live in `src/lib/metrics/` with unit tests next to them (`npm test`).
- `functions/` is outside the Next.js build. Cloudflare Pages finds it and deploys it with the site.
- **Why Analytics Engine, not D1:** it's made for counting events, needs no tables or migrations,
  writes never slow down or fail the visitor's request, it deletes old data by itself after three
  months (good for privacy), and the free plan covers far more than this site needs (100,000 events a
  day). D1 would keep raw rows forever unless cleaned up, and needs a schema. The trade-off: reading
  needs an API token, and very high traffic is sampled (counts stay accurate on average).
- The tracker is off in `next dev` and in any build without `NEXT_PUBLIC_METRICS=1` (its code is in
  the bundle but never started). To try it locally:
  `NEXT_PUBLIC_METRICS=1 npm run dev` (events will 404 locally, which is harmless).

## Setup (after the site is on Cloudflare Pages)

1. **Access first.** Follow "Layer 1: Cloudflare Access" in [DEPLOY.md](DEPLOY.md) so the Access
   application covers both `johnojo.me/admin/*` **and** `johnojo.me/api/metrics`. Copy its
   **Application Audience (AUD) tag** and note your team domain (`<team>.cloudflareaccess.com`).
2. **Read-only API token.** Cloudflare dashboard → My Profile → API Tokens → Create token → Custom:
   - Permissions: **Account → Account Analytics → Read**. Nothing else.
   - Account resources: your account only. Optionally limit it with an expiry date.
3. **Pages settings.** Workers & Pages → the `johnojo-me` project → Settings:
   - **Bindings → Add → Analytics Engine**: variable name `METRICS`, dataset `johnojo_metrics`
     (it's created on the first event).
   - **Variables and secrets** (Production):
     | Name | Value |
     |---|---|
     | `METRICS_ENABLED` | `true` |
     | `METRICS_DATASET` | `johnojo_metrics` |
     | `METRICS_ALLOWED_HOSTS` | `johnojo.me,www.johnojo.me` |
     | `CF_ACCOUNT_ID` | your account id |
     | `CF_API_TOKEN` | the token from step 2, type **Secret** |
     | `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
     | `ACCESS_AUD` | the AUD tag from step 1 |
     | `NEXT_PUBLIC_METRICS` | `1` (switches the tracker on in the build) |
   - Or keep these in a `wrangler.toml` made from [`wrangler.example.toml`](../wrangler.example.toml).
4. **Hard rate limit (free).** Security → WAF → Rate limiting rules → one rule: URI path equals
   `/hit`, 60 requests per 10 seconds per IP, action Block for 10 seconds. (The function's own
   limit is per server, so this is the reliable one.)
5. Redeploy (Deployments → Retry deployment), visit a few pages, then open
   `https://johnojo.me/admin/metrics/`. Analytics Engine shows new events within a minute or so.

To switch metrics off at any time: set `METRICS_ENABLED` to `false` (stops collecting and the API)
and remove `NEXT_PUBLIC_METRICS` (removes the tracker from the pages on the next build).

## If it isn't working

The admin page explains what it got back:

| Message | Meaning |
|---|---|
| No data yet: the API isn't deployed | You're on a host without the Pages Functions (e.g. local `out/`). |
| No data yet: switched off or not set up | `METRICS_ENABLED`, `METRICS_DATASET`, `CF_ACCOUNT_ID` or `CF_API_TOKEN` is missing. |
| Sign-in needed | The request didn't carry a valid Access token. Check the Access app includes `/api/metrics`. |
| Not set up yet | `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is missing or mistyped. Nothing is shown until it's fixed. |
| Cloudflare didn't answer | The Analytics Engine query failed or timed out (5 s). The function logs the reason. |

Function logs (Workers & Pages → project → Functions → Real-time logs) are one JSON line per outcome,
e.g. `{"level":"warn","route":"metrics","outcome":"denied","reason":"wrong-audience"}`. They never
contain IPs, emails or request bodies.

## Cloudflare Web Analytics, alongside

The Cloudflare Web Analytics beacon (`NEXT_PUBLIC_CF_BEACON_TOKEN`, see
[PERFORMANCE.md](PERFORMANCE.md)) keeps working unchanged and is independent of this. Use both:

- **Web Analytics**: visits, countries, devices and **real-visitor speed (Core Web Vitals)**, in the
  Cloudflare dashboard. It can't count button clicks.
- **Site metrics** (this): page views plus **which buttons and links people use**, on your own admin page.

Page-view numbers won't match exactly: each tool filters bots differently, and this one skips visitors
with Do Not Track or Global Privacy Control.

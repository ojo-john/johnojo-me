# Performance, metrics and monitoring

The site is static, so there are no servers to log. Monitoring has two layers.

## 1. Real visitors: Cloudflare Web Analytics (free, no cookies)

Turned on by setting `NEXT_PUBLIC_CF_BEACON_TOKEN` in the Cloudflare Pages project (Settings →
Environment variables), using the token from **Analytics & Logs → Web Analytics → Add a site**.

The dashboard shows, per page: visits, top pages and referrers, countries and devices, and **Core Web
Vitals from real visitors**: LCP (loading), INP (responsiveness), CLS (layout shift), with the slowest
pages and elements. It sets no cookies, stores no personal data and doesn't track people across sites,
so no cookie banner is needed. Cloudflare also shows request counts, bandwidth and errors for the site
under the Pages project's analytics.

Targets (75th percentile of real visits): **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**.

## 2. Every change: Lighthouse lab checks

```
npm run build && npm run perf
```

Opens nothing; writes **`reports/perf/index.html`**, a dashboard with the latest scores per page, a
trend line across runs, and links to each page's full Lighthouse report. The same check runs on every
pull request in GitHub Actions; the report is attached to the run as `performance-report`.

Budgets: performance ≥ 90, accessibility / best practices / SEO ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.1,
JavaScript ≤ 170 KB (compressed).

## Latest lab results (25 Oct 2026, mobile, simulated slow 4G)

| Page | Perf | A11y | Best pr. | SEO | LCP | CLS | JS |
|---|---|---|---|---|---|---|---|
| Home | 93 | 95 | 100 | 100 | 3.1 s | 0.001 | 153 KB |
| Work | 98 | 100 | 100 | 100 | 2.5 s | 0 | 147 KB |
| Travel | 92 | 100 | 100 | 100 | 3.2 s | 0 | 147 KB |
| Europe 2024 | 87 | 98 | 100 | 100 | 3.9 s | 0 | 153 KB |
| Journal | 98 | 100 | 100 | 100 | 2.5 s | 0 | 147 KB |

Lab vs field: Lighthouse simulates a mid-range phone on a slow 4G connection, so its LCP runs well
above what most real visits see on Cloudflare's network (the same pages paint in about 60 ms on a fast
connection). Photo-led trip pages are the slowest because the hero photo shares that simulated
bandwidth with the fonts and scripts.

What's already done: static HTML, AVIF/WebP photos in five sizes with explicit dimensions (no layout
shift), lazy loading below the fold, a preloaded hero image, only two fonts preloaded, no prefetching
of other trips' data, no map library (maps are pre-drawn SVG), click-to-play video.

Next steps if trip pages need to go higher: an extra 720 px photo size for phones, and trimming font
weights.

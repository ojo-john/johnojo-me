/**
 * npm run perf            (after `npm run build`)
 * npm run perf -- --strict   fail when a budget is missed (used in CI)
 *
 * Lab performance check. Serves out/ with compression (like Cloudflare does), runs Lighthouse in
 * mobile mode on the key pages, compares the results with the budgets below, and writes:
 *   reports/perf/index.html     a dashboard with the latest scores and the trend over time
 *   reports/perf/<page>.html    the full Lighthouse report for each page
 *   reports/perf/history.json   every run, for the trend
 *
 * Lab numbers simulate a mid-range phone on slow 4G, so they run slower than real visits. Real-visitor
 * numbers come from Cloudflare Web Analytics (see docs/PERFORMANCE.md).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const BUDGET = { performance: 90, accessibility: 95, "best-practices": 95, seo: 95, jsKB: 170, lcpMs: 2500, cls: 0.1 };
const OUT = path.join(process.cwd(), "out");
const REPORTS = path.join(process.cwd(), "reports", "perf");
const STRICT = process.argv.includes("--strict");
const PORT = 8790;

if (!fs.existsSync(path.join(OUT, "index.html"))) {
  console.error("No build found. Run npm run build first.");
  process.exit(1);
}

/** Representative pages: one of each template, plus the newest trip. */
function pages(): string[] {
  const trips = fs.existsSync(path.join(OUT, "travel")) ? fs.readdirSync(path.join(OUT, "travel")).filter((d) => fs.existsSync(path.join(OUT, "travel", d, "index.html"))).sort() : [];
  const posts = fs.existsSync(path.join(OUT, "journal")) ? fs.readdirSync(path.join(OUT, "journal")).filter((d) => fs.existsSync(path.join(OUT, "journal", d, "index.html"))) : [];
  return ["/", "/work/", "/travel/", ...(trips.length ? [`/travel/${trips[trips.length - 1]}/`] : []), "/journal/", ...(posts[0] ? [`/journal/${posts[0]}/`] : [])];
}

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4", ".xml": "application/xml" };

/** Minimal static server with gzip, so text assets are measured compressed as they are in production. */
function serve(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = path.join(OUT, url);
    if (!file.startsWith(OUT)) return void res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) return void res.writeHead(404).end();
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    const body = fs.readFileSync(file);
    const compress = /text|javascript|json|xml|svg/.test(type) && /gzip/.test(String(req.headers["accept-encoding"]));
    res.writeHead(200, { "Content-Type": type, ...(compress ? { "Content-Encoding": "gzip" } : {}) });
    res.end(compress ? zlib.gzipSync(body) : body);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

interface Result {
  page: string;
  scores: Record<string, number>;
  lcpMs: number;
  cls: number;
  tbtMs: number;
  totalKB: number;
  jsKB: number;
  failures: string[];
}

async function main() {
  const server = await serve();
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new"] });
  fs.mkdirSync(REPORTS, { recursive: true });
  const results: Result[] = [];
  try {
    for (const page of pages()) {
      const run = await lighthouse(`http://localhost:${PORT}${page}`, {
        port: chrome.port,
        output: "html",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        formFactor: "mobile",
      });
      if (!run) throw new Error(`Lighthouse returned nothing for ${page}`);
      const { lhr } = run;
      const audit = (id: string) => lhr.audits[id]?.numericValue ?? 0;
      const requests = (lhr.audits["network-requests"]?.details as { items?: { resourceType?: string; transferSize?: number }[] })?.items ?? [];
      const r: Result = {
        page,
        scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)])),
        lcpMs: Math.round(audit("largest-contentful-paint")),
        cls: Math.round(audit("cumulative-layout-shift") * 1000) / 1000,
        tbtMs: Math.round(audit("total-blocking-time")),
        totalKB: Math.round(audit("total-byte-weight") / 1024),
        jsKB: Math.round(requests.filter((i) => i.resourceType === "Script").reduce((a, i) => a + (i.transferSize ?? 0), 0) / 1024),
        failures: [],
      };
      for (const k of ["performance", "accessibility", "best-practices", "seo"] as const) if (r.scores[k] < BUDGET[k]) r.failures.push(`${k} ${r.scores[k]} < ${BUDGET[k]}`);
      if (r.jsKB > BUDGET.jsKB) r.failures.push(`JS ${r.jsKB} KB > ${BUDGET.jsKB} KB`);
      if (r.cls > BUDGET.cls) r.failures.push(`CLS ${r.cls} > ${BUDGET.cls}`);
      results.push(r);
      fs.writeFileSync(path.join(REPORTS, `${page.replace(/\//g, "_").replace(/^_|_$/g, "") || "home"}.html`), run.report as string);
      console.log(`${page.padEnd(28)} perf ${r.scores.performance} · a11y ${r.scores.accessibility} · bp ${r.scores["best-practices"]} · seo ${r.scores.seo} · LCP ${(r.lcpMs / 1000).toFixed(1)}s · CLS ${r.cls} · JS ${r.jsKB} KB${r.failures.length ? `   ⚠ ${r.failures.join("; ")}` : ""}`);
    }
  } finally {
    await chrome.kill();
    server.close();
  }

  const historyFile = path.join(REPORTS, "history.json");
  const history: { at: string; results: Result[] }[] = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, "utf8")) : [];
  history.push({ at: new Date().toISOString(), results });
  fs.writeFileSync(historyFile, JSON.stringify(history.slice(-100), null, 1));
  fs.writeFileSync(path.join(REPORTS, "index.html"), dashboard(history));
  console.log(`\nDashboard: ${path.relative(process.cwd(), path.join(REPORTS, "index.html"))}`);

  const failed = results.filter((r) => r.failures.length);
  if (failed.length && STRICT) process.exitCode = 1;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Self-contained HTML dashboard: latest results per page plus a performance-score trend line. */
function dashboard(history: { at: string; results: Result[] }[]): string {
  const latest = history[history.length - 1];
  const cell = (v: number, ok: boolean) => `<td class="${ok ? "ok" : "bad"}">${v}</td>`;
  const rows = latest.results
    .map((r) => {
      const file = `${r.page.replace(/\//g, "_").replace(/^_|_$/g, "") || "home"}.html`;
      const trend = history.map((h) => h.results.find((x) => x.page === r.page)?.scores.performance).filter((v): v is number => typeof v === "number");
      const pts = trend.map((v, i) => `${(i / Math.max(1, trend.length - 1)) * 120},${40 - (v / 100) * 40}`).join(" ");
      return `<tr><th scope="row"><a href="${file}">${esc(r.page)}</a></th>${cell(r.scores.performance, r.scores.performance >= BUDGET.performance)}${cell(r.scores.accessibility, r.scores.accessibility >= BUDGET.accessibility)}${cell(r.scores["best-practices"], r.scores["best-practices"] >= BUDGET["best-practices"])}${cell(r.scores.seo, r.scores.seo >= BUDGET.seo)}${cell(+(r.lcpMs / 1000).toFixed(1), r.lcpMs <= BUDGET.lcpMs)}${cell(r.cls, r.cls <= BUDGET.cls)}<td>${r.tbtMs}</td>${cell(r.jsKB, r.jsKB <= BUDGET.jsKB)}<td>${r.totalKB}</td><td><svg width="120" height="40" role="img" aria-label="Performance trend: ${trend.join(", ")}"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}"/></svg></td></tr>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Performance · johnojo.me</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:32px 20px;background:#f1f0eb;color:#121417}main{max-width:1100px;margin:auto}h1{margin:0 0 4px}p{color:#4a4e55;margin:0 0 20px}
.t{overflow-x:auto;background:#fbfaf7;border:2px solid #121417}table{border-collapse:collapse;width:100%;min-width:900px}th,td{padding:10px 12px;border-bottom:1px solid #d8d6cf;text-align:left;font-variant-numeric:tabular-nums}
thead th{font:600 11px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:#4a4e55}td.ok{color:#2f6b3f}td.bad{color:#b3261e;font-weight:700}a{color:#2541b2}</style></head>
<body><main><h1>Page performance</h1><p>Lab run ${esc(new Date(latest.at).toLocaleString("en-GB"))}: Lighthouse, mobile, simulated slow 4G. Red means a budget was missed (performance ≥ ${BUDGET.performance}, accessibility/SEO/best practices ≥ 95, LCP ≤ 2.5 s, CLS ≤ ${BUDGET.cls}, JS ≤ ${BUDGET.jsKB} KB). Real-visitor numbers are in Cloudflare Web Analytics. ${history.length} run(s) recorded.</p>
<div class="t"><table><thead><tr><th>Page</th><th>Perf</th><th>A11y</th><th>Best pr.</th><th>SEO</th><th>LCP s</th><th>CLS</th><th>TBT ms</th><th>JS KB</th><th>Total KB</th><th>Perf trend</th></tr></thead><tbody>
${rows}</tbody></table></div></main></body></html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

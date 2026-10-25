/**
 * npm run resume:pdf   (after `npm run build`)
 *
 * Prints the built /resume/ page to public/resume.pdf with headless Chrome, so the PDF always matches
 * content/experience.yaml. Commit the PDF; Cloudflare's build machines don't have Chrome.
 */
import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(path.join(OUT, "resume", "index.html"))) {
  console.error("No built résumé page. Run npm run build first.");
  process.exit(1);
}
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  let file = path.join(OUT, decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!file.startsWith(OUT) || !fs.existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file));
});
await new Promise<void>((r) => server.listen(8791, r));
const target = path.join(process.cwd(), "public", "resume.pdf");
// Async so this process can keep serving the page while Chrome loads it; a throwaway profile keeps
// it independent of any Chrome window you have open.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "resume-chrome-"));
try {
  await promisify(execFile)(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--user-data-dir=${profile}`, `--print-to-pdf=${target}`, "--virtual-time-budget=5000", "http://localhost:8791/resume/"], { timeout: 60_000 });
} finally {
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
fs.copyFileSync(target, path.join(OUT, "resume.pdf"));
console.log(`Wrote public/resume.pdf (${Math.round(fs.statSync(target).size / 1024)} KB)`);

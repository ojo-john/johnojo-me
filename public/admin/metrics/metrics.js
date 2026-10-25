// Admin metrics page: fetches /api/metrics (behind Cloudflare Access) and draws totals, a daily chart
// and top lists. Every value is written with textContent, never as HTML, so a stored label can't run code.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";
  const nf = new Intl.NumberFormat("en-US");

  /** Plain-language messages for each way the API can be unavailable. */
  const REASONS = {
    404: ["No data yet", "The metrics API isn't deployed yet. It goes live with the site on Cloudflare Pages (docs/METRICS.md)."],
    401: ["Sign-in needed", "Open this page through johnojo.me/admin/ so Cloudflare Access can confirm it's you."],
    403: ["Sign-in needed", "Cloudflare Access didn't confirm it's you. Reload the page to sign in again."],
    500: ["Not set up yet", "Cloudflare Access settings are missing on the metrics API (ACCESS_TEAM_DOMAIN, ACCESS_AUD)."],
    502: ["Cloudflare didn't answer", "The analytics store didn't respond. Try again in a minute."],
    503: ["No data yet", "Metrics are switched off or not fully set up yet (docs/METRICS.md)."],
  };

  function showStatus(title, text) {
    const box = $("status");
    box.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = text;
    box.append(h, p);
    box.hidden = false;
    $("report").hidden = true;
  }

  function table(id, rows, labelKey, valueKey) {
    const t = $(id);
    t.replaceChildren();
    if (!rows.length) {
      const tr = t.insertRow();
      const td = tr.insertCell();
      td.className = "empty";
      td.textContent = "Nothing yet";
      return;
    }
    const max = Math.max(...rows.map((r) => r[valueKey]), 1);
    for (const r of rows.slice(0, 15)) {
      const tr = t.insertRow();
      const name = tr.insertCell();
      name.textContent = r[labelKey];
      const meter = document.createElement("div");
      meter.className = "meter";
      const fill = document.createElement("i");
      fill.style.width = `${(r[valueKey] / max) * 100}%`;
      meter.append(fill);
      name.append(meter);
      tr.insertCell().textContent = nf.format(r[valueKey]);
    }
  }

  function chart(daily) {
    const svg = $("daily");
    svg.replaceChildren();
    const w = 600;
    const h = 160;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const max = Math.max(...daily.map((d) => d.views), 1);
    const step = w / daily.length;
    daily.forEach((d, i) => {
      const bh = (d.views / max) * (h - 8);
      const rect = document.createElementNS(SVG, "rect");
      rect.setAttribute("x", String(i * step + step * 0.15));
      rect.setAttribute("width", String(step * 0.7));
      rect.setAttribute("y", String(h - bh));
      rect.setAttribute("height", String(Math.max(bh, d.views ? 2 : 1)));
      rect.setAttribute("fill", d.views ? "var(--bar)" : "var(--bar-2)");
      const title = document.createElementNS(SVG, "title");
      title.textContent = `${d.day}: ${nf.format(d.views)} views`;
      rect.append(title);
      svg.append(rect);
    });
    const peak = Math.max(0, ...daily.map((d) => d.views));
    $("daily-range").textContent = daily.length ? `${daily[0].day} to ${daily[daily.length - 1].day} (UTC) · busiest day ${nf.format(peak)} views` : "";
  }

  function render(m) {
    $("status").hidden = true;
    $("report").hidden = false;
    $("t-views").textContent = nf.format(m.totals.views);
    $("t-clicks").textContent = nf.format(m.totals.clicks);
    $("t-pages").textContent = nf.format(m.pages.length);
    chart(m.daily);
    table("pages", m.pages, "path", "views");
    table("clicks", m.clicks, "label", "count");
    table("links", m.links, "target", "count");
    table("referrers", m.referrers, "host", "count");
    $("generated").textContent = `Updated ${new Date(m.generatedAt).toLocaleString()}. Counts may be rounded when traffic is high.`;
    if (!m.totals.views && !m.totals.clicks) showStatus("No data yet", "Metrics are set up, but nobody has been counted in this period yet.");
  }

  async function load(days) {
    document.querySelectorAll(".range button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.days === String(days))));
    let res;
    try {
      res = await fetch(`/api/metrics?days=${days}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
    } catch {
      return showStatus("No data yet", "Couldn't reach the metrics API. Check your connection, or deploy the site first.");
    }
    const type = res.headers.get("content-type") || "";
    // A static host without the API answers 404, or serves an HTML page; both mean "not deployed".
    if (!res.ok || !type.includes("application/json")) {
      const [title, text] = REASONS[res.ok ? 404 : res.status] || ["No data yet", `The metrics API answered ${res.status}.`];
      return showStatus(title, text);
    }
    try {
      render(await res.json());
    } catch {
      showStatus("No data yet", "The metrics API sent something this page couldn't read.");
    }
  }

  document.querySelectorAll(".range button").forEach((b) => b.addEventListener("click", () => load(Number(b.dataset.days))));
  load(30);
})();

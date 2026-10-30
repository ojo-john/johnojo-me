// Admin dashboard: reads /admin/dashboard.json (built with the site, behind the admin login) and draws
// the stats, the "needs you" checklist (each item opens that stop in the editor) and the trip cards.
(function () {
  "use strict";
  // This browser belongs to the site owner: the site's visitor counter skips it (src/lib/metrics/tracker.ts).
  try {
    localStorage.setItem("metrics:owner", "1");
  } catch {
    // Storage blocked (private mode): this visit to the site may be counted, nothing else breaks.
  }
  const $ = (id) => document.getElementById(id);
  const EDITOR = "/admin/editor/#/collections";
  const visitUrl = (n) => `${EDITOR}/visits/entries/${n.trip}--${n.visit}`;
  const tripUrl = (t) => `${EDITOR}/trips/entries/${t.slug}`;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    n.append(...kids.filter(Boolean));
    return n;
  };

  const hour = new Date().getHours();
  $("today").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"} · ${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}`;

  function countUp(node, to) {
    if (reduced || to === 0) return void (node.textContent = String(to));
    const start = performance.now(), ms = 900;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms);
      node.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  let data = null;
  let filter = "all";
  let showAll = false;
  /** Rows shown before "Show all": enough to act on without a wall of tasks. */
  const FIRST_ROWS = 8;

  function renderNeeds() {
    const list = $("needs");
    list.innerHTML = "";
    const items = data.needs.filter((n) => filter === "all" || n.needs.includes(filter));
    $("needs-count").textContent = String(data.needs.length);
    if (!items.length) {
      list.append(el("li", { class: "empty", text: filter === "all" ? "All caught up. Nothing needs you right now." : "Nothing in this group." }));
      return;
    }
    const shown = showAll ? items : items.slice(0, FIRST_ROWS);
    shown.forEach((n, i) => {
      const what = el("span", { class: "what" }, ...n.detail.split(" · ").map((d) => el("span", { text: d })), n.published ? null : el("span", { class: "draft", text: "draft" }));
      const li = el("li", {}, el("a", { href: visitUrl(n) }, el("span", { class: "where" }, document.createTextNode(n.city), el("small", { text: n.tripTitle })), what, el("span", { class: "go", text: "Fix →" })));
      li.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
      list.append(li);
    });
    if (items.length > shown.length) {
      const more = el("button", { type: "button", class: "more", text: `Show all ${items.length}` });
      more.addEventListener("click", () => {
        showAll = true;
        renderNeeds();
      });
      list.append(el("li", { class: "more-row" }, more));
    }
  }

  function renderTrips() {
    const q = $("trip-search").value.trim().toLowerCase();
    const box = $("trips");
    box.innerHTML = "";
    data.trips
      .filter((t) => !q || `${t.title} ${t.year}`.toLowerCase().includes(q))
      .forEach((t, i) => {
        const ph = el("div", { class: "ph" });
        if (t.cover) {
          const img = el("img", { src: t.cover.thumb, alt: "", loading: "lazy" });
          if (t.cover.focus) img.style.objectPosition = `${t.cover.focus.x}% ${t.cover.focus.y}%`;
          // Drafts' photos aren't on public storage yet: fall back to the blurred stand-in.
          img.addEventListener("error", () => t.cover.placeholder && img.src !== t.cover.placeholder && (img.src = t.cover.placeholder));
          ph.append(img);
        } else ph.append(el("span", { class: "none", text: "no photos yet" }));
        ph.append(el("span", { class: `badge ${t.status === "published" ? "live" : ""}`, text: t.status === "published" ? "Live" : "Draft" }));
        const links = el("div", { class: "links" }, el("a", { href: tripUrl(t), text: "Edit" }), t.status === "published" ? el("a", { href: `/travel/${t.slug}/`, target: "_blank", rel: "noopener", text: "View ↗" }) : null);
        const card = el("article", { class: "trip" }, ph, el("div", { class: "bd" }, el("h3", { text: t.title }), el("span", { class: "meta", text: `${t.stops} ${t.stops === 1 ? "stop" : "stops"} · ${t.photos} photos${t.kind === "match-day" ? " · match day" : ""}` }), links));
        card.style.animationDelay = `${Math.min(i, 12) * 40}ms`;
        box.append(card);
      });
    if (!box.children.length) box.append(el("p", { class: "empty", text: "No trips match." }));
  }

  document.querySelectorAll("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderNeeds();
    }),
  );
  $("trip-search").addEventListener("input", () => data && renderTrips());

  fetch("/admin/dashboard.json", { credentials: "same-origin" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((d) => {
      data = d;
      const s = d.stats;
      document.querySelectorAll("[data-count]").forEach((n) => countUp(n, s[n.dataset.count] ?? 0));
      const pct = s.stops ? Math.round((s.complete / s.stops) * 100) : 100;
      countUp($("pct"), pct);
      setTimeout(() => ($("pct").textContent = `${pct}%`), reduced ? 0 : 950);
      $("pct-label").textContent = `${s.complete} of ${s.stops} live stops complete`;
      requestAnimationFrame(() => (document.querySelector(".ring .fill").style.strokeDashoffset = String(314.16 * (1 - pct / 100))));
      const left = d.needs.length;
      $("lede").textContent = left ? `${left} ${left === 1 ? "thing needs" : "things need"} you. Knock one out, or upload something new.` : "Everything's filled in. Go somewhere new.";
      $("built").textContent = `Site last built ${new Date(d.generatedAt).toLocaleString()}`;
      renderNeeds();
      renderTrips();
    })
    .catch((err) => ($("lede").textContent = `Couldn't load the dashboard (${err.message}). Reload to try again.`));
})();

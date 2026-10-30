// Signs the editor in with the Cloudflare Access login you already passed to reach this page, so there's
// no second GitHub sign-in. The editor talks to GitHub through /api/github (src/lib/github-proxy/), which
// adds the site's own token on the server; the "token" stored here is a placeholder the proxy ignores.
// Runs before the editor loads. On the first visit it looks up the GitHub account the site saves as,
// stores it the way the editor expects (localStorage "sveltia-cms.user") and reloads once.
(() => {
  "use strict";
  const KEY = "sveltia-cms.user";
  const PLACEHOLDER = "signed-in-with-cloudflare-access";
  // On your own computer the editor works on local files ("Work with Local Repository"); nothing to do.
  if (location.hostname === "localhost") return;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    stored = null;
  }
  if (stored && stored.backendName === "github" && stored.token === PLACEHOLDER) return;
  fetch("/api/github/user", { credentials: "same-origin", headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((u) => {
      const user = { backendName: "github", id: u.id, name: u.name || u.login, login: u.login, email: u.email, avatarURL: u.avatar_url, profileURL: u.html_url, bot: false, token: PLACEHOLDER };
      localStorage.setItem(KEY, JSON.stringify(user));
      location.reload();
    })
    .catch((e) => {
      // The proxy isn't set up yet (no token on the server) or GitHub is down: the editor's own sign-in screen still works.
      console.warn("Automatic editor sign-in unavailable:", e.message);
    });
})();

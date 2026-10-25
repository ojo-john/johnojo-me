// Adds a "Site metrics" button to the editor's toolbar (shown after signing in). It opens
// /admin/metrics/ in a new tab; the page can't be embedded because /admin/* forbids framing.
if (window.CMS && typeof window.CMS.registerCustomPage === "function") {
  window.CMS.registerCustomPage({ id: "metrics", label: "Site metrics", icon: "monitoring", url: "/admin/metrics/", newTab: true });
}

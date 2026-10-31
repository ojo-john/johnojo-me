import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Static export: every page is generated at build time and served as plain files from Cloudflare Pages.
// No server features (API routes, server actions, image optimizer) are used; images are pre-processed
// by `npm run media` instead.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  // The admin preview (drafts and scheduled content) is a second export served under the admin login.
  ...(process.env.PREVIEW_BUILD === "1" ? { basePath: "/admin/preview" } : {}),
  images: { unoptimized: true },
  // The build cache missed edits to globals.css twice (it shipped the previous stylesheet), so
  // production builds always start clean. Builds take a few seconds longer; correctness wins.
  experimental: { turbopackFileSystemCacheForBuild: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

/**
 * The editor lives in public/admin/index.html (and the metrics page in public/admin/metrics/). Static
 * hosts serve them at /admin/, but `next dev` only serves public files at their exact path, so in
 * development only, those folder addresses are pointed at their index.html. Static export ignores
 * rewrites (Next prints a one-line warning about that in dev; it's expected), and the production build
 * never sees this.
 */
const devEditorRewrite: NextConfig["rewrites"] = async () => [
  { source: "/admin/", destination: "/admin/index.html" },
  { source: "/admin/metrics/", destination: "/admin/metrics/index.html" },
  { source: "/admin/upload/", destination: "/admin/upload/index.html" },
  { source: "/admin/editor/", destination: "/admin/editor/index.html" },
];

/**
 * Photos aren't in the repo; on Cloudflare Pages they come from R2. A Pages build without MEDIA_BASE_URL
 * would publish a site full of broken images, so it stops here with the fix instead.
 */
if (process.env.CF_PAGES === "1" && !process.env.MEDIA_BASE_URL) {
  throw new Error("MEDIA_BASE_URL is not set for this Cloudflare Pages build. Add MEDIA_BASE_URL=https://media.johnojo.me in the Pages project's build settings (docs/MEDIA.md).");
}

export default function config(phase: string): NextConfig {
  return phase === PHASE_DEVELOPMENT_SERVER ? { ...nextConfig, rewrites: devEditorRewrite } : nextConfig;
}

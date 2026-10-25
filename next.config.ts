import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Static export: every page is generated at build time and served as plain files from Cloudflare Pages.
// No server features (API routes, server actions, image optimizer) are used; images are pre-processed
// by `npm run media` instead.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
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
 * The editor lives in public/admin/index.html. Static hosts serve it at /admin/, but `next dev` only
 * serves public files at their exact path, so in development only, /admin and /admin/ are pointed at
 * the file. Static export ignores rewrites (Next prints a one-line warning about that in dev; it's
 * expected), and the production build never sees this.
 */
const devEditorRewrite: NextConfig["rewrites"] = async () => [{ source: "/admin/", destination: "/admin/index.html" }];

export default function config(phase: string): NextConfig {
  return phase === PHASE_DEVELOPMENT_SERVER ? { ...nextConfig, rewrites: devEditorRewrite } : nextConfig;
}

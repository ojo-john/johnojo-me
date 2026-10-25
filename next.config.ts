import type { NextConfig } from "next";

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

export default nextConfig;

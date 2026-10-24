import type { NextConfig } from "next";

// Static export: every page is generated at build time and served as plain files from Cloudflare Pages.
// No server features (API routes, server actions, image optimizer) are used; images are pre-processed
// by `npm run media` instead.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
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

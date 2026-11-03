import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The launcher builds and runs the everyday app from its own folder (".next-app"), so a developer build
  // or `npm run dev` (".next") can never replace files under a running background server.
  distDir: process.env.CLAUDE_TREE_DIST || ".next",
  cacheComponents: true,
  partialPrefetching: true,
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

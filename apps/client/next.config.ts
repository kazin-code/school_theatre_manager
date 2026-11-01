import path from "node:path";
import type { NextConfig } from "next";

// The repository root: the client imports shared code from packages/core.
const root = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  // Cached components: reads use "use cache" + cacheTag; mutations call updateTag.
  cacheComponents: true,
  partialPrefetching: true,
  // Self-contained screens the Windows installer ships with its own copy of Node (beside the server).
  output: "standalone",
  outputFileTracingRoot: root,
  // The screens hold no data: the server (apps/server) has the database, files and backups.
  // Never ship a development data folder.
  outputFileTracingExcludes: { "/**": ["./data/**/*"] },
  experimental: {
    // Show materials (scripts, scores, rehearsal tracks) can be large.
    serverActions: { bodySizeLimit: "250mb" },
  },
  turbopack: {
    root,
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;

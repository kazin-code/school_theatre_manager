import path from "node:path";
import type { NextConfig } from "next";

// The repository root: the client imports shared code from packages/core.
const root = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  // Cached components: reads use "use cache" + cacheTag; mutations call updateTag.
  cacheComponents: true,
  partialPrefetching: true,
  // A self-contained server the Windows installer ships with its own copy of Node.
  output: "standalone",
  outputFileTracingRoot: root,
  serverExternalPackages: ["better-sqlite3"],
  // Ship the SQL migrations with the server.
  outputFileTracingIncludes: { "/**": ["../../packages/core/drizzle/**/*"] },
  // Never ship a development database.
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

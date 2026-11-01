import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cached components: reads use "use cache" + cacheTag; mutations call updateTag.
  cacheComponents: true,
  partialPrefetching: true,
  // A self-contained server the Windows installer ships with its own copy of Node.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Ship the SQL migrations with the server.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  // Never ship a development database.
  outputFileTracingExcludes: { "/**": ["./data/**/*"] },
  experimental: {
    // Show materials (scripts, scores, rehearsal tracks) can be large.
    serverActions: { bodySizeLimit: "250mb" },
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;

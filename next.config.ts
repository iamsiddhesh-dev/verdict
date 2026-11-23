import type { NextConfig } from "next";

// Vercel sets VERCEL=1 during its build. There is no custom server there, so the
// browser polls instead of opening a WebSocket, and the Tectonic binary plus its
// warmed package cache (fetched by scripts/vercel-prebuild.mjs) ship with the
// functions that run the queue.
const onVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // These run in Node only and break when bundled: PGlite ships a WASM binary it
  // loads from its own package directory, and unpdf/mammoth pull in large
  // optional dependencies.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth", "linkedom", "postgres"],
  env: {
    NEXT_PUBLIC_LIVE_SOCKET: process.env.NEXT_PUBLIC_LIVE_SOCKET ?? (onVercel ? "off" : "on"),
  },
  ...(onVercel && {
    outputFileTracingIncludes: {
      "/api/**/*": ["./.data/bin/tectonic", "./.data/tectonic-cache/**/*"],
    },
    // Production on Supabase never touches the local WASM database.
    outputFileTracingExcludes: {
      "/**/*": ["./node_modules/@electric-sql/pglite/**/*", "./.data/pglite/**/*"],
    },
  }),
};

export default nextConfig;

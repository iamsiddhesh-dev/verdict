import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These run in Node only and break when bundled: PGlite ships a WASM binary it
  // loads from its own package directory, and unpdf/mammoth pull in large
  // optional dependencies.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth", "linkedom", "postgres"],
};

export default nextConfig;

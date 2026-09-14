import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/brand";

// Read SITE_URL per request, not at build time: images are built before the domain is known.
export const dynamic = "force-dynamic";

// Public pages are indexable. Everything behind sign-in, and the API, is not.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacy", "/terms"], disallow: ["/api/", "/auth/", "/dashboard", "/profile", "/runs/"] }],
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}

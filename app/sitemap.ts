import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: new URL("/", base).toString(), changeFrequency: "weekly", priority: 1 },
    { url: new URL("/login", base).toString(), changeFrequency: "yearly", priority: 0.5 },
    { url: new URL("/privacy", base).toString(), changeFrequency: "yearly", priority: 0.3 },
    { url: new URL("/terms", base).toString(), changeFrequency: "yearly", priority: 0.3 },
  ];
}

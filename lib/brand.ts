// Names, copy and links used across the site, the metadata and the share images.

export const PRODUCT_NAME = "Verdict";
export const TAGLINE = "Know if a job is worth applying to, before you spend an hour on it.";
export const DESCRIPTION =
  "Paste a job link. Verdict reads it, checks the company, and scores it against your real resume: apply, borderline or skip, with the reasons. When it is a fit, it writes your answers, outreach and a one-page tailored resume, without claiming anything you have not done.";
export const REPO_URL = "https://github.com/iamsiddhesh-dev/verdict";
export const X_HANDLE = "@__iamsiddhesh__";

/** The public origin, for absolute URLs in metadata, the sitemap and share images. */
export function siteUrl(): URL {
  const raw = process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

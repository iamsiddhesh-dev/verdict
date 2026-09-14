"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * The URL and publishable key are passed down from the server at request time
 * rather than read from NEXT_PUBLIC_ variables, which Next inlines at BUILD time.
 * A Docker image built without them would otherwise ship a sign-in page that
 * cannot work, and changing a key would mean rebuilding the image.
 */
export function createSupabaseBrowser(config: { url: string; key: string }) {
  return createBrowserClient(config.url, config.key);
}

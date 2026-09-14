import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireAuthConfig } from "./config";

/** For route handlers and server components. Session refresh cookies are written when the context allows it. */
export async function createSupabaseServer() {
  const { url, key } = requireAuthConfig();
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Server components cannot set cookies. proxy.ts refreshes the session
          // on every request, so nothing is lost here.
        }
      },
    },
  });
}

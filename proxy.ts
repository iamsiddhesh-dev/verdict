// Runs before every page and API request.
//
// Keeps the Supabase session fresh (an expired access token is swapped for a new
// one here, where cookies can be written) and sends signed-out visitors on app
// pages to sign in. This is the fast, optimistic check; every route handler and
// page still verifies the user itself through lib/auth.ts.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, requireAuthConfig } from "@/lib/supabase/config";

const APP_PAGES = ["/dashboard", "/profile", "/runs"];

export async function proxy(request: NextRequest) {
  if (!authConfigured()) return NextResponse.next({ request });
  const { url, key } = requireAuthConfig();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub && !data.claims.is_anonymous);
  const path = request.nextUrl.pathname;

  const redirectKeepingCookies = (to: URL) => {
    const res = NextResponse.redirect(to);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  if (!signedIn && APP_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) {
    const to = new URL("/login", request.url);
    to.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return redirectKeepingCookies(to);
  }
  if (signedIn && path === "/login") {
    return redirectKeepingCookies(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

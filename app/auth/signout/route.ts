import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/supabase/config";
import { createSupabaseServer } from "@/lib/supabase/server";

// POST only, so a link or an image tag on another site cannot sign someone out.
export async function POST(request: Request) {
  if (authConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut({ scope: "local" });
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}

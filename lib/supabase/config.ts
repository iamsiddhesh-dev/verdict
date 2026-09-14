// Supabase Auth settings. Only the project URL and the publishable key are used,
// both of which are designed to be public: they identify the project, and every
// permission check happens on Supabase's side against the signed-in user.

export function supabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
}

export function supabaseKey(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
}

export function authConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

export function requireAuthConfig(): { url: string; key: string } {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) {
    throw new Error("Sign-in is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, key };
}

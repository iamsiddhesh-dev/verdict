// Check every configured provider key with the smallest possible request.
//   npm run probe:keys
// Prints which keys work and what their rate-limit headers say. Never prints a key.

import { keyId, sharedKeys, type ProviderName } from "@/lib/llm/providers";

const ENDPOINTS: Partial<Record<ProviderName, { url: string; model: string; auth: "bearer" | "google" }>> = {
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-20b", auth: "bearer" },
  cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", model: "gpt-oss-120b", auth: "bearer" },
  mistral: { url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest", auth: "bearer" },
  google: { url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", model: "gemini-flash-latest", auth: "google" },
};

for (const [provider, ep] of Object.entries(ENDPOINTS) as Array<[ProviderName, NonNullable<(typeof ENDPOINTS)[ProviderName]>]>) {
  const keys = sharedKeys(provider);
  if (!keys.length) {
    console.log(`${provider}: no key configured`);
    continue;
  }
  for (const key of keys) {
    const started = Date.now();
    try {
      const res =
        ep.auth === "google"
          ? await fetch(ep.url, {
              method: "POST",
              headers: { "content-type": "application/json", "x-goog-api-key": key },
              body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the word ok." }] }] }),
            })
          : await fetch(ep.url, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
              body: JSON.stringify({ model: ep.model, max_tokens: 20, messages: [{ role: "user", content: "Reply with the word ok." }] }),
            });
      const limits = [...res.headers].filter(([h]) => h.startsWith("x-ratelimit")).map(([h, v]) => `${h.replace("x-ratelimit-", "")}=${v}`);
      const body = res.ok ? "" : ` ${(await res.text()).slice(0, 160)}`;
      console.log(`${provider} ${keyId(provider, key)}: ${res.status} in ${Date.now() - started}ms${body}${limits.length ? `\n    ${limits.join(" ")}` : ""}`);
    } catch (err) {
      console.log(`${provider} ${keyId(provider, key)}: request failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

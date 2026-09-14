// The free providers this app can call, and how to build a client for each.
//
// Keys come from comma-separated env vars (GROQ_API_KEYS=a,b) with the singular
// name as a fallback, the same convention as startHunt, so its .env lines can be
// reused unchanged. A provider with no key is simply absent from every route.

import { createHash } from "node:crypto";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type ProviderName = "google" | "groq" | "cerebras" | "mistral" | "openrouter";

export const PROVIDERS: ProviderName[] = ["google", "groq", "cerebras", "mistral", "openrouter"];

const KEY_ENV: Record<ProviderName, [plural: string, singular: string]> = {
  google: ["GEMINI_API_KEYS", "GEMINI_API_KEY"],
  groq: ["GROQ_API_KEYS", "GROQ_API_KEY"],
  cerebras: ["CEREBRAS_API_KEYS", "CEREBRAS_API_KEY"],
  mistral: ["MISTRAL_API_KEYS", "MISTRAL_API_KEY"],
  openrouter: ["OPENROUTER_API_KEYS", "OPENROUTER_API_KEY"],
};

export type CallerKeys = Partial<Record<ProviderName, string>>;

export function sharedKeys(provider: ProviderName): string[] {
  const [plural, singular] = KEY_ENV[provider];
  const raw = `${process.env[plural] ?? ""},${process.env[singular] ?? ""}`;
  return [...new Set(raw.split(",").map((k) => k.trim()).filter(Boolean))];
}

/**
 * A caller's own key for a provider is used exclusively when present, never with
 * the shared pool behind it. Falling through to the shared pool would put the
 * heaviest users back on the shared quota exactly when it is scarcest.
 */
export function keysFor(provider: ProviderName, caller?: CallerKeys): string[] {
  const own = caller?.[provider]?.trim();
  return own ? [own] : sharedKeys(provider);
}

/** Short, stable and not the key. Safe to log and to store. */
export function keyId(provider: ProviderName, key: string): string {
  return `${provider}:${createHash("sha256").update(key).digest("hex").slice(0, 8)}`;
}

const clients = new Map<string, (model: string) => LanguageModel>();

export function modelFor(provider: ProviderName, apiKey: string, model: string): LanguageModel {
  const cacheKey = `${provider}:${apiKey}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = buildClient(provider, apiKey);
    clients.set(cacheKey, client);
  }
  return client(model);
}

function buildClient(provider: ProviderName, apiKey: string): (model: string) => LanguageModel {
  switch (provider) {
    case "google":
      return createGoogleGenerativeAI({ apiKey });
    case "groq":
      return createGroq({ apiKey });
    // supportsStructuredOutputs is required on the OpenAI-compatible providers.
    // Without it the SDK downgrades to json_object mode and only describes the
    // schema in the prompt, which startHunt measured at 0/3 on real schemas.
    case "cerebras":
      return createOpenAICompatible({
        name: "cerebras",
        baseURL: "https://api.cerebras.ai/v1",
        apiKey,
        supportsStructuredOutputs: true,
      });
    case "mistral":
      return createOpenAICompatible({
        name: "mistral",
        baseURL: "https://api.mistral.ai/v1",
        apiKey,
        supportsStructuredOutputs: true,
      });
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        supportsStructuredOutputs: true,
      });
  }
}

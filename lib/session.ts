// Anonymous-first sessions.
//
// Every visitor gets a random user id in a signed, HttpOnly cookie on their
// first request, set by the custom server before Next.js sees the request (see
// server.ts). No sign-up stands between someone and their first verdict. A
// Google sign-in that keeps the same id can be layered on later without
// changing anything that reads `userId`.
//
// The cookie is `<uuid>.<hmac>`. The HMAC is what stops someone from pasting
// another person's id into their cookie and reading their runs.

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SESSION_COOKIE = "ja_session";
const MAX_AGE_S = 60 * 60 * 24 * 365;

let cachedSecret: Buffer | null = null;

function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const env = process.env.SESSION_SECRET?.trim();
  if (env) {
    cachedSecret = Buffer.from(env, "utf8");
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  // Local development: generate once and keep it, so a restart does not sign
  // everyone out of their own runs.
  const file = path.join(process.cwd(), ".data", "session-secret");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"));
  }
  cachedSecret = Buffer.from(readFileSync(file, "utf8").trim(), "utf8");
  return cachedSecret;
}

function sign(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function verifySessionValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!UUID_RX.test(id)) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return id;
}

export function newSessionValue(forId?: string): { id: string; value: string } {
  const id = forId && UUID_RX.test(forId) ? forId : randomUUID();
  return { id, value: `${id}.${sign(id)}` };
}

export function sessionCookieHeader(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure}`;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

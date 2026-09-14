// Outbound HTTP for URLs that users paste.
//
// A hosted product that fetches arbitrary user-supplied URLs is an SSRF hole by
// default: paste http://169.254.169.254/ and the server reads its own cloud
// metadata. Every hostname is resolved first and refused if any address is
// private, loopback, link-local or otherwise not on the public internet.
// Redirects are followed by hand so each hop is checked the same way.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 3_000_000;

export class BlockedUrlError extends Error {}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateV4(mapped[1]) : false;
}

export function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 6 ? isPrivateV6(ip) : isPrivateV4(ip);
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only http and https links can be read.");
  }
  if (url.username || url.password) throw new BlockedUrlError("Links with credentials in them are not fetched.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new BlockedUrlError("That address is not on the public internet.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) throw new BlockedUrlError(`The domain ${host} does not resolve.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new BlockedUrlError("That address is not on the public internet.");
  }
  return url;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
  headers: Record<string, string>;
}

/** Never throws for HTTP errors; returns null only for network failure or a refused address. */
export async function safeFetch(
  raw: string,
  init: { accept?: string; timeoutMs?: number; method?: "GET" | "HEAD" } = {},
): Promise<FetchedPage | null> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let url: URL;
    try {
      url = await assertPublicUrl(current);
    } catch {
      return null;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: init.method ?? "GET",
        headers: init.accept ? { ...BROWSER_HEADERS, Accept: init.accept } : BROWSER_HEADERS,
        redirect: "manual",
        signal: ctrl.signal,
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, url).href;
        continue;
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k] = v));
      const body = init.method === "HEAD" ? "" : await readCapped(res);
      return { url: url.href, status: res.status, contentType: res.headers.get("content-type") ?? "", body, headers };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchJson(url: string): Promise<unknown | null> {
  const page = await safeFetch(url, { accept: "application/json" });
  if (!page || page.status < 200 || page.status >= 300) return null;
  try {
    return JSON.parse(page.body);
  } catch {
    return null;
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

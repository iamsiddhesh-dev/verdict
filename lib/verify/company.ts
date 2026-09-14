// Company-level facts: the same for every posting from one company, so they are
// cached per domain.
//
// None of this is a legitimacy judgment. Each check records what could be
// confirmed and what could not, and a check that cannot run says so rather than
// guessing. "Not confirmed" is information, not suspicion.

import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { parseHTML } from "linkedom";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { queryRows } from "@/lib/db";
import { registrableDomain } from "@/lib/fetch/ats";
import { fetchJson, safeFetch } from "@/lib/fetch/http";
import { htmlToText, normalizeWhitespace } from "@/lib/fetch/text";
import { generateStructured, type WaitNotice } from "@/lib/llm";
import { CACHE_TTL_MS } from "@/lib/llm/cache";

export type CompanyType = "product" | "services" | "staffing" | "eor" | "unknown";

export interface CompanyFacts {
  domain: string;
  resolves: boolean;
  homepageStatus: number | null;
  registeredAt: string | null;
  registrationLookup: "found" | "unavailable";
  mailProvider: "google" | "microsoft" | "zoho" | "other" | "none" | "unknown";
  mailHosts: string[];
  pages: { about: string | null; contact: string | null; careers: string | null };
  socialLinks: string[];
  /** Plain text of the homepage, about and contact pages, for office and type checks. */
  siteText: string;
  careersText: string;
  companyType: CompanyType;
  companyTypeEvidence: string | null;
  checkedAt: string;
}

const CACHE_DAYS = 3;

function mailProviderOf(hosts: string[]): CompanyFacts["mailProvider"] {
  const all = hosts.join(" ").toLowerCase();
  if (!hosts.length) return "none";
  if (/google\.com|googlemail\.com/.test(all)) return "google";
  if (/outlook\.com|microsoft/.test(all)) return "microsoft";
  if (/zoho\./.test(all)) return "zoho";
  return "other";
}

async function dnsFacts(domain: string) {
  const [a4, a6, mx] = await Promise.all([
    resolve4(domain).catch(() => []),
    resolve6(domain).catch(() => []),
    resolveMx(domain).then(
      (r) => ({ ok: true as const, hosts: r.sort((x, y) => x.priority - y.priority).map((m) => m.exchange) }),
      (err: NodeJS.ErrnoException) => ({ ok: err.code === "ENODATA" || err.code === "ENOTFOUND", hosts: [] as string[] }),
    ),
  ]);
  return {
    resolves: a4.length + a6.length > 0,
    mailHosts: mx.hosts,
    mailProvider: mx.ok ? mailProviderOf(mx.hosts) : ("unknown" as const),
  };
}

/** Registration date from RDAP, the structured successor to WHOIS. Many ccTLDs (including .in) do not publish one. */
async function registrationDate(domain: string): Promise<string | null> {
  const data = (await fetchJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`)) as {
    events?: Array<{ eventAction?: string; eventDate?: string }>;
  } | null;
  return data?.events?.find((e) => e.eventAction === "registration")?.eventDate ?? null;
}

const PAGE_HINTS = {
  about: /about|who-we-are|company|our-story/i,
  contact: /contact|reach-us|get-in-touch|locations|offices/i,
  careers: /career|jobs|join-us|work-with-us|hiring|openings|open-roles/i,
};

const SOCIAL_RX = /https?:\/\/(?:www\.)?(linkedin\.com\/company\/[^"'\s?#]+|x\.com\/[^"'\s?#/]+|twitter\.com\/[^"'\s?#/]+)/gi;

function findPageLinks(html: string, origin: string) {
  const { document } = parseHTML(html);
  const found: CompanyFacts["pages"] = { about: null, contact: null, careers: null };
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    const label = `${href} ${a.textContent ?? ""}`;
    let abs: URL;
    try {
      abs = new URL(href, origin);
    } catch {
      continue;
    }
    if (registrableDomain(abs.hostname) !== registrableDomain(new URL(origin).hostname)) {
      // Careers pages frequently live on an ATS host; keep those.
      if (!(PAGE_HINTS.careers.test(label) && /lever|greenhouse|ashby|workable|recruitee|keka|zoho|darwinbox|freshteam/i.test(abs.hostname))) continue;
    }
    for (const key of Object.keys(PAGE_HINTS) as Array<keyof typeof PAGE_HINTS>) {
      if (!found[key] && PAGE_HINTS[key].test(label)) found[key] = abs.href;
    }
  }
  return found;
}

async function pageText(url: string | null): Promise<string> {
  if (!url) return "";
  const page = await safeFetch(url);
  if (!page || page.status >= 400) return "";
  return htmlToText(page.body).slice(0, 20_000);
}

const companyTypeSchema = z.object({
  type: z.enum(["product", "services", "staffing", "eor", "unknown"]),
  evidence: z
    .string()
    .nullable()
    .describe("A short phrase copied word for word from the site text that shows what the company sells. null if none."),
});

export const COMPANY_TYPE_GUIDE = `- product: sells its own software, app or platform
- services: builds software or does consulting for clients (agencies, IT services, dev shops)
- staffing: recruitment, placement, talent acquisition or contract staffing for other companies
- eor: employer of record, payroll or PEO services
- unknown: the text does not make it clear`;

function normalizeForMatch(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function classify(domain: string, text: string, onWait?: (n: WaitNotice) => void) {
  if (text.trim().length < 200) return { type: "unknown" as CompanyType, evidence: null };
  const { object } = await generateStructured({
    task: "companyType",
    schema: companyTypeSchema,
    reasoning: "low",
    cacheTtlMs: CACHE_TTL_MS.companyType,
    onWait,
    maxWaitMs: 60_000,
    prompt: `Classify the company at ${domain} from its own website text, into one of:
${COMPANY_TYPE_GUIDE}
Judge by what the company says it sells, not by its job listings. If it does both product and services, choose what the text leads with.

Website text:
"""
${text.slice(0, 6_000)}
"""`,
  });
  // A classification must be backed by the company's own words. If the quoted
  // evidence is not actually on the site, the label is not trusted.
  if (object.type !== "unknown" && object.evidence && !normalizeForMatch(text).includes(normalizeForMatch(object.evidence))) {
    return { type: "unknown" as CompanyType, evidence: null };
  }
  return { type: object.type as CompanyType, evidence: object.evidence };
}

export async function companyFacts(website: string, onWait?: (n: WaitNotice) => void): Promise<CompanyFacts> {
  const domain = registrableDomain(new URL(website).hostname);

  const cached = await queryRows<{ data: CompanyFacts }>(sql`
    SELECT data FROM company_checks
    WHERE domain = ${domain} AND checked_at > now() - make_interval(days => ${CACHE_DAYS})
  `);
  if (cached[0]) return cached[0].data;

  const [dns, registeredAt, home] = await Promise.all([
    dnsFacts(domain),
    registrationDate(domain).catch(() => null),
    safeFetch(`https://${domain}`).then((p) => p ?? safeFetch(`https://www.${domain}`)),
  ]);

  const origin = home ? new URL(home.url).origin : `https://${domain}`;
  const homeHtml = home && home.status < 400 ? home.body : "";
  const pages = homeHtml ? findPageLinks(homeHtml, origin) : { about: null, contact: null, careers: null };
  if (!pages.careers && homeHtml) {
    for (const guess of [`${origin}/careers`, `${origin}/jobs`]) {
      const p = await safeFetch(guess, { method: "HEAD" });
      if (p && p.status < 400) {
        pages.careers = guess;
        break;
      }
    }
  }
  const [aboutText, contactText, careersText] = await Promise.all([
    pageText(pages.about),
    pageText(pages.contact),
    pageText(pages.careers),
  ]);
  const homeText = homeHtml ? htmlToText(homeHtml).slice(0, 12_000) : "";
  const siteText = normalizeWhitespace([homeText, aboutText, contactText].join("\n\n")).slice(0, 30_000);
  const socialLinks = [...new Set((homeHtml.match(SOCIAL_RX) ?? []).map((s) => s.replace(/\/$/, "")))].slice(0, 4);

  const kind = await classify(domain, [aboutText, homeText].join("\n\n"), onWait).catch(() => ({
    type: "unknown" as CompanyType,
    evidence: null,
  }));

  const facts: CompanyFacts = {
    domain,
    resolves: dns.resolves,
    homepageStatus: home?.status ?? null,
    registeredAt,
    registrationLookup: registeredAt ? "found" : "unavailable",
    mailProvider: dns.mailProvider,
    mailHosts: dns.mailHosts.slice(0, 3),
    pages,
    socialLinks,
    siteText,
    careersText,
    companyType: kind.type,
    companyTypeEvidence: kind.evidence,
    checkedAt: new Date().toISOString(),
  };

  await queryRows(sql`
    INSERT INTO company_checks (domain, data) VALUES (${domain}, ${JSON.stringify(facts)}::jsonb)
    ON CONFLICT (domain) DO UPDATE SET data = EXCLUDED.data, checked_at = now()
  `);
  return facts;
}

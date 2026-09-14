// Stage 1: turn whatever the user gave us into the text of one job posting.
//
// Tiers, in order:
//   1. ATS API          a hosted Lever/Greenhouse/Ashby/Workable/Recruitee link,
//                       or a careers page that embeds one of them
//   2. Structured data  schema.org JobPosting JSON-LD, which most careers pages
//                       and many job boards publish for Google Jobs
//   3. Readable HTML    the main content of the page, via Readability
//   4. Paste            always available; the only path for gated pages
//
// Headless-browser fetching and screenshot reading come later.
//
// When a page cannot be read, the outcome says why in plain words so the UI can
// open the paste box without treating it as an error. LinkedIn and social posts
// are refused before any request is made: their terms prohibit automated access
// and they sit behind a login anyway.

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { atsRefFromEmbed, fetchAtsPosting, parseAtsUrl } from "./ats";
import { BlockedUrlError, assertPublicUrl, safeFetch } from "./http";
import { decodeEntities, htmlToText, normalizeWhitespace, wordCount } from "./text";
import type { FetchOutcome, FetchedJob } from "./types";

export type { FetchOutcome, FetchedJob, FetchBlockReason } from "./types";

const LINKEDIN = /(^|\.)(linkedin\.com|lnkd\.in)$/i;
const SOCIAL = /(^|\.)(x\.com|twitter\.com|t\.co|instagram\.com|facebook\.com|fb\.com|threads\.net|threads\.com)$/i;

// Hosts that list other companies' jobs. A posting found on one of these does
// not tell us the employer's own website.
const JOB_BOARDS =
  /(^|\.)(wellfound\.com|angel\.co|naukri\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|instahyre\.com|cutshort\.io|internshala\.com|foundit\.in|monsterindia\.com|shine\.com|hirist\.tech|iimjobs\.com|workatastartup\.com|ycombinator\.com|remoteok\.com|weworkremotely\.com|himalayas\.app|unstop\.com|apna\.co|google\.com|notion\.site|notion\.so|typeform\.com|tally\.so|forms\.gle|jobs\.lever\.co|greenhouse\.io|ashbyhq\.com|workable\.com|recruitee\.com|keka\.com|zohorecruit\.[a-z.]+|freshteam\.com|darwinbox\.in|smartrecruiters\.com|myworkdayjobs\.com|breezy\.hr|bamboohr\.com|jobvite\.com|icims\.com|turinghire\.com|peoplehum\.com)$/i;

const BOT_CHECK = /just a moment|cf-chl|challenge-platform|attention required|verify you are human|are you a robot|captcha|access denied|request unsuccessful|incapsula|perimeterx|datadome/i;
const LOGIN_WALL = /sign in to (continue|view|see)|log in to (continue|view|see)|please (log|sign) in|login required|create an account to/i;

const MIN_WORDS = 80;

function blocked(reason: Exclude<FetchOutcome, { ok: true }>["reason"], message: string, url: string): FetchOutcome {
  return { ok: false, reason, message, url };
}

interface JsonLdJob {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string | string[];
  jobLocationType?: string;
  hiringOrganization?: { name?: string; sameAs?: string; url?: string } | string;
  jobLocation?: unknown;
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string } };
  applicantLocationRequirements?: unknown;
}

function findJobPostings(node: unknown, out: JsonLdJob[] = []): JsonLdJob[] {
  if (Array.isArray(node)) node.forEach((n) => findJobPostings(n, out));
  else if (node && typeof node === "object") {
    const t = (node as JsonLdJob)["@type"];
    if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) out.push(node as JsonLdJob);
    const graph = (node as { "@graph"?: unknown })["@graph"];
    if (graph) findJobPostings(graph, out);
  }
  return out;
}

function locationText(loc: unknown): string | null {
  const one = (l: unknown): string | null => {
    const a = (l as { address?: unknown })?.address ?? l;
    if (typeof a === "string") return a;
    const addr = a as { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } };
    const country = typeof addr?.addressCountry === "string" ? addr.addressCountry : addr?.addressCountry?.name;
    return [addr?.addressLocality, addr?.addressRegion, country].filter(Boolean).join(", ") || null;
  };
  if (Array.isArray(loc)) return loc.map(one).filter(Boolean).join(" / ") || null;
  return loc ? one(loc) : null;
}

function companySiteFor(pageUrl: URL, hinted?: string | null): string | null {
  if (hinted) {
    try {
      const u = new URL(hinted);
      if (!JOB_BOARDS.test(u.hostname) && !LINKEDIN.test(u.hostname) && !SOCIAL.test(u.hostname)) return u.origin;
    } catch {
      // fall through to the page's own host
    }
  }
  return JOB_BOARDS.test(pageUrl.hostname) ? null : pageUrl.origin;
}

function fromJsonLd(doc: Document, pageUrl: URL): FetchedJob | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const posting = findJobPostings(data)[0];
    if (!posting?.title || !posting.description) continue;
    const org = typeof posting.hiringOrganization === "string" ? { name: posting.hiringOrganization } : posting.hiringOrganization;
    const text = htmlToText(decodeEntities(posting.description));
    if (wordCount(text) < MIN_WORDS / 2) continue;
    const v = posting.baseSalary?.value;
    const salary =
      v && (v.minValue || v.maxValue || v.value)
        ? `${posting.baseSalary?.currency ?? ""} ${[v.minValue ?? v.value, v.maxValue].filter(Boolean).join(" - ")}${v.unitText ? ` per ${v.unitText.toLowerCase()}` : ""}`.trim()
        : null;
    return {
      tier: "structured",
      source: "web",
      sourceLabel: JOB_BOARDS.test(pageUrl.hostname) ? pageUrl.hostname.replace(/^www\./, "") : "the company's careers page",
      url: pageUrl.href,
      title: decodeEntities(posting.title),
      company: org?.name ?? null,
      companyWebsite: companySiteFor(pageUrl, org?.sameAs ?? org?.url),
      location: locationText(posting.jobLocation),
      isRemote: posting.jobLocationType === "TELECOMMUTE" ? true : null,
      employmentType: Array.isArray(posting.employmentType) ? posting.employmentType.join(", ") : posting.employmentType ?? null,
      salary,
      postedAt: posting.datePosted ?? null,
      text,
    };
  }
  return null;
}

function fromReadability(html: string, doc: Document, pageUrl: URL): FetchedJob | null {
  const meta = (name: string) =>
    doc.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ??
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ??
    null;
  // Readability mutates the document it is given, so it gets its own copy.
  const { document: copy } = parseHTML(html);
  const article = new Readability(copy as unknown as Document, { charThreshold: 200 }).parse();
  const text = article?.content ? htmlToText(article.content) : normalizeWhitespace(article?.textContent ?? "");
  if (wordCount(text) < MIN_WORDS) return null;
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  return {
    tier: "html",
    source: "web",
    sourceLabel: JOB_BOARDS.test(pageUrl.hostname) ? pageUrl.hostname.replace(/^www\./, "") : "the company's careers page",
    url: pageUrl.href,
    title: h1 || meta("og:title") || article?.title || doc.title || null,
    company: meta("og:site_name"),
    companyWebsite: companySiteFor(pageUrl),
    location: null,
    isRemote: null,
    employmentType: null,
    salary: null,
    postedAt: null,
    text,
  };
}

export async function fetchJob(rawUrl: string): Promise<FetchOutcome> {
  const trimmed = rawUrl.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return blocked("invalid_url", "That does not look like a link. Paste the job description instead and we will carry on.", trimmed);
  }

  if (LINKEDIN.test(url.hostname)) {
    return blocked(
      "linkedin",
      "LinkedIn does not allow automated reading of its pages, so we do not fetch them. Paste the job description here and everything else works the same.",
      url.href,
    );
  }
  if (SOCIAL.test(url.hostname)) {
    return blocked(
      "social",
      "Posts on X, Instagram and Facebook sit behind a login, so we cannot read them. Paste the post's text here and we will carry on.",
      url.href,
    );
  }

  try {
    await assertPublicUrl(url.href);
  } catch (err) {
    const message = err instanceof BlockedUrlError ? err.message : "That link could not be reached.";
    return blocked("invalid_url", `${message} Paste the job description instead and we will carry on.`, url.href);
  }

  const direct = parseAtsUrl(url.href);
  if (direct) {
    const job = await fetchAtsPosting(direct, url.href);
    if (job && wordCount(job.text) >= MIN_WORDS / 2) return { ok: true, job };
    // A known ATS link whose API has no such posting is almost always a closed role.
    if (!job) {
      return blocked(
        "not_found",
        "This posting is no longer listed on the company's job board, so it has probably closed. If you still have the description, paste it here.",
        url.href,
      );
    }
  }

  const page = await safeFetch(url.href);
  if (!page) {
    return blocked("unreadable", "We could not reach that page. Paste the job description here and we will carry on.", url.href);
  }
  if (page.status === 404 || page.status === 410) {
    return blocked("not_found", "That page no longer exists, so the role has probably closed. If you still have the description, paste it here.", url.href);
  }
  if ((page.status === 403 || page.status === 429 || page.status === 503) && BOT_CHECK.test(page.body.slice(0, 20_000))) {
    return blocked(
      "bot_check",
      "This site runs a bot check, so we could not read the page automatically. Paste the job description here and we will carry on.",
      url.href,
    );
  }
  if (page.status >= 400) {
    return blocked("unreadable", "That page did not load for us. Paste the job description here and we will carry on.", url.href);
  }

  const pageUrl = new URL(page.url);
  const embedded = atsRefFromEmbed(page.url, page.body);
  if (embedded) {
    const job = await fetchAtsPosting(embedded, page.url);
    if (job) {
      job.companyWebsite = job.companyWebsite ?? companySiteFor(pageUrl);
      return { ok: true, job };
    }
  }

  const { document } = parseHTML(page.body);
  const doc = document as unknown as Document;
  const structured = fromJsonLd(doc, pageUrl);
  if (structured) return { ok: true, job: structured };

  const readable = fromReadability(page.body, doc, pageUrl);
  if (readable) return { ok: true, job: readable };

  if (LOGIN_WALL.test(page.body.slice(0, 50_000))) {
    return blocked("login", "This page needs a login, so we could not read it. Paste the job description here and we will carry on.", url.href);
  }
  if (BOT_CHECK.test(page.body.slice(0, 20_000))) {
    return blocked("bot_check", "This site runs a bot check, so we could not read the page automatically. Paste the job description here and we will carry on.", url.href);
  }
  return blocked(
    "unreadable",
    "This page builds its content in the browser, so there was no description for us to read. Paste it here and we will carry on.",
    url.href,
  );
}

/** Tier 4. Pasted text is taken as-is; the Read stage pulls the structure out of it. */
export function jobFromPaste(text: string, url: string | null): FetchedJob {
  let website: string | null = null;
  if (url) {
    try {
      website = companySiteFor(new URL(url));
    } catch {
      website = null;
    }
  }
  return {
    tier: "paste",
    source: "paste",
    sourceLabel: "pasted text",
    url,
    title: null,
    company: null,
    companyWebsite: website && !LINKEDIN.test(new URL(website).hostname) && !SOCIAL.test(new URL(website).hostname) ? website : null,
    location: null,
    isRemote: null,
    employmentType: null,
    salary: null,
    postedAt: null,
    text: normalizeWhitespace(text),
  };
}

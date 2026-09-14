// Tier 1: applicant-tracking systems with public JSON APIs.
//
// startHunt's connectors fetch a whole board. A pasted link names one posting,
// so each ATS here is called at its per-posting endpoint where one exists, and
// otherwise the board is fetched and the posting picked out by id.

import { fetchJson, safeFetch } from "./http";
import { decodeEntities, htmlToText } from "./text";
import type { AtsType, FetchedJob } from "./types";

export interface AtsRef {
  type: AtsType;
  slug: string;
  postingId: string;
  eu?: boolean;
}

const RESERVED = new Set(["embed", "job_board", "www", "api", "jobs", "careers", "posting-api", "o", "j"]);

/** Recognise a posting URL on a hosted ATS board. */
export function parseAtsUrl(raw: string): AtsRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (/^jobs(\.eu)?\.lever\.co$/.test(host) && parts.length >= 2) {
    return { type: "lever", slug: parts[0], postingId: parts[1], eu: host.includes(".eu.") };
  }
  if (/^(job-boards|boards)(\.eu)?\.greenhouse\.io$/.test(host)) {
    if (parts[0] === "embed") {
      const slug = url.searchParams.get("for");
      const token = url.searchParams.get("token");
      if (slug && token) return { type: "greenhouse", slug, postingId: token, eu: host.includes(".eu.") };
      return null;
    }
    const jobsAt = parts.indexOf("jobs");
    if (jobsAt === 1 && parts[2] && /^\d+$/.test(parts[2])) {
      return { type: "greenhouse", slug: parts[0], postingId: parts[2], eu: host.includes(".eu.") };
    }
  }
  if (host === "jobs.ashbyhq.com" && parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1])) {
    return { type: "ashby", slug: parts[0], postingId: parts[1] };
  }
  if (host === "apply.workable.com" && parts.length >= 3 && parts[1] === "j") {
    return { type: "workable", slug: parts[0], postingId: parts[2] };
  }
  const recruitee = host.match(/^([a-z0-9-]+)\.recruitee\.com$/);
  if (recruitee && parts[0] === "o" && parts[1] && !RESERVED.has(recruitee[1])) {
    return { type: "recruitee", slug: recruitee[1], postingId: parts[1] };
  }
  return null;
}

/**
 * A company's own careers page often embeds its ATS: ?gh_jid=123 alongside a
 * greenhouse board script, or ?ashby_jid=uuid alongside an Ashby embed. Given
 * the page URL and its HTML, recover the posting reference.
 */
export function atsRefFromEmbed(pageUrl: string, html: string): AtsRef | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const ghId = url.searchParams.get("gh_jid");
  if (ghId && /^\d+$/.test(ghId)) {
    const m = html.match(/greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=|)([a-zA-Z0-9_-]+)/i);
    const slug = m?.[1];
    if (slug && !RESERVED.has(slug.toLowerCase())) return { type: "greenhouse", slug, postingId: ghId };
  }
  const ashbyId = url.searchParams.get("ashby_jid");
  if (ashbyId) {
    const m = html.match(/jobs\.ashbyhq\.com\/([a-zA-Z0-9_.-]+)/i);
    if (m?.[1] && !RESERVED.has(m[1].toLowerCase())) return { type: "ashby", slug: m[1], postingId: ashbyId };
  }
  return null;
}

const LABEL: Record<AtsType, string> = {
  lever: "Lever",
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  workable: "Workable",
  recruitee: "Recruitee",
};

function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function base(ref: AtsRef, url: string): Omit<FetchedJob, "title" | "text"> {
  return {
    tier: "ats",
    source: ref.type,
    sourceLabel: LABEL[ref.type],
    url,
    company: humanizeSlug(ref.slug),
    companyWebsite: null,
    location: null,
    isRemote: null,
    employmentType: null,
    salary: null,
    postedAt: null,
  };
}

function money(min?: number | null, max?: number | null, currency?: string | null): string | null {
  if (!min && !max) return null;
  const c = currency ? `${currency} ` : "";
  if (min && max) return `${c}${min.toLocaleString("en-US")} - ${max.toLocaleString("en-US")}`;
  return `${c}${(min ?? max)!.toLocaleString("en-US")}`;
}

async function lever(ref: AtsRef, url: string): Promise<FetchedJob | null> {
  const api = `https://api${ref.eu ? ".eu" : ""}.lever.co/v0/postings/${encodeURIComponent(ref.slug)}/${encodeURIComponent(ref.postingId)}`;
  const j = (await fetchJson(api)) as {
    text?: string;
    descriptionPlain?: string;
    description?: string;
    lists?: Array<{ text?: string; content?: string }>;
    additionalPlain?: string;
    categories?: { location?: string; commitment?: string; allLocations?: string[] };
    workplaceType?: string;
    createdAt?: number;
    salaryRange?: { min?: number; max?: number; currency?: string };
  } | null;
  if (!j?.text) return null;
  // Lever keeps requirements in `lists`, separate from the description. Leaving
  // them out drops exactly the part a fit judgment depends on.
  const lists = (j.lists ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`).join("\n\n");
  const text = [j.descriptionPlain ?? htmlToText(j.description ?? ""), lists, j.additionalPlain ?? ""]
    .filter(Boolean)
    .join("\n\n");
  const loc = j.categories?.allLocations?.join(", ") || j.categories?.location || null;
  return {
    ...base(ref, url),
    title: j.text,
    text,
    location: loc,
    isRemote: (j.workplaceType ?? "").toLowerCase() === "remote" || /remote/i.test(loc ?? ""),
    employmentType: j.categories?.commitment ?? null,
    salary: money(j.salaryRange?.min, j.salaryRange?.max, j.salaryRange?.currency),
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
  };
}

async function greenhouse(ref: AtsRef, url: string): Promise<FetchedJob | null> {
  const root = `https://boards-api${ref.eu ? ".eu" : ""}.greenhouse.io/v1/boards/${encodeURIComponent(ref.slug)}`;
  const [j, board] = await Promise.all([
    fetchJson(`${root}/jobs/${encodeURIComponent(ref.postingId)}?content=true`) as Promise<{
      title?: string;
      content?: string;
      location?: { name?: string };
      updated_at?: string;
      first_published?: string;
      company_name?: string;
    } | null>,
    fetchJson(root) as Promise<{ name?: string } | null>,
  ]);
  if (!j?.title) return null;
  const loc = j.location?.name ?? null;
  return {
    ...base(ref, url),
    title: j.title,
    // The API double-encodes: content is HTML whose tags are themselves entities.
    text: htmlToText(decodeEntities(j.content ?? "")),
    company: j.company_name ?? board?.name ?? humanizeSlug(ref.slug),
    location: loc,
    isRemote: /remote/i.test(loc ?? ""),
    postedAt: j.first_published ?? j.updated_at ?? null,
  };
}

async function ashby(ref: AtsRef, url: string): Promise<FetchedJob | null> {
  const data = (await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.slug)}?includeCompensation=true`,
  )) as {
    jobs?: Array<{
      id?: string;
      title?: string;
      location?: string;
      isRemote?: boolean;
      employmentType?: string;
      publishedAt?: string;
      jobUrl?: string;
      descriptionPlain?: string;
      descriptionHtml?: string;
      compensation?: { compensationTierSummary?: string };
    }>;
  } | null;
  const id = ref.postingId.toLowerCase();
  const j = data?.jobs?.find((x) => x.id?.toLowerCase() === id || x.jobUrl?.toLowerCase().includes(id));
  if (!j?.title) return null;
  return {
    ...base(ref, url),
    title: j.title,
    text: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
    location: j.location ?? null,
    isRemote: j.isRemote ?? null,
    employmentType: j.employmentType ?? null,
    salary: j.compensation?.compensationTierSummary ?? null,
    postedAt: j.publishedAt ?? null,
  };
}

async function workable(ref: AtsRef, url: string): Promise<FetchedJob | null> {
  const data = (await fetchJson(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(ref.slug)}?details=true`,
  )) as {
    name?: string;
    jobs?: Array<{
      shortcode?: string;
      title?: string;
      description?: string;
      requirements?: string;
      benefits?: string;
      city?: string;
      country?: string;
      telecommuting?: boolean;
      employment_type?: string;
      published_on?: string;
    }>;
  } | null;
  const j = data?.jobs?.find((x) => x.shortcode?.toLowerCase() === ref.postingId.toLowerCase());
  if (!j?.title) return null;
  const loc = [j.city, j.country].filter(Boolean).join(", ") || null;
  return {
    ...base(ref, url),
    title: j.title,
    company: data?.name ?? humanizeSlug(ref.slug),
    text: htmlToText([j.description, j.requirements, j.benefits].filter(Boolean).join("\n")),
    location: loc,
    isRemote: j.telecommuting ?? null,
    employmentType: j.employment_type ?? null,
    postedAt: j.published_on ?? null,
  };
}

async function recruitee(ref: AtsRef, url: string): Promise<FetchedJob | null> {
  const data = (await fetchJson(`https://${ref.slug}.recruitee.com/api/offers/`)) as {
    offers?: Array<{
      slug?: string;
      title?: string;
      description?: string;
      requirements?: string;
      location?: string;
      remote?: boolean;
      employment_type_code?: string;
      published_at?: string;
      careers_url?: string;
      company_name?: string;
    }>;
  } | null;
  const o = data?.offers?.find((x) => x.slug === ref.postingId || x.careers_url?.endsWith(`/o/${ref.postingId}`));
  if (!o?.title) return null;
  return {
    ...base(ref, url),
    title: o.title,
    company: o.company_name ?? humanizeSlug(ref.slug),
    text: htmlToText([o.description, o.requirements].filter(Boolean).join("\n")),
    location: o.location ?? null,
    isRemote: o.remote ?? null,
    employmentType: o.employment_type_code ?? null,
    postedAt: o.published_at ?? null,
  };
}

const ATS_HOSTS = /(lever\.co|greenhouse\.io|ashbyhq\.com|workable\.com|recruitee\.com)$/i;
const NOT_A_COMPANY_SITE =
  /(google|googleapis|gstatic|facebook|linkedin|twitter|x\.com|instagram|youtube|glassdoor|cloudfront|amazonaws|cookielaw|onetrust|hcaptcha|recaptcha|jsdelivr|unpkg|fonts\.|w3\.org|schema\.org|apple\.com|github\.com|medium\.com)/i;

const TWO_PART_TLDS = /\.(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/i;

/** "careers.acme.co.in" -> "acme.co.in". Good enough for matching, not a public-suffix list. */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const labels = host.split(".");
  const keep = TWO_PART_TLDS.test(host) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The ATS APIs do not say where the employer's own website is, and the
 * verification stage needs a real domain rather than a guess from the board
 * slug: a guessed domain would run every check against what may be a different
 * company. So the posting page is searched for a link to a domain whose name
 * matches the company. Ashby states it outright in its page data. With no
 * name match this returns null, and verification says it could not establish
 * the company's site instead of checking the wrong one.
 */
export async function atsCompanyWebsite(ref: AtsRef, postingUrl: string, companyName: string | null): Promise<string | null> {
  const page = await safeFetch(postingUrl);
  if (!page || page.status >= 400) return null;
  const html = page.body;
  if (ref.type === "ashby") {
    const m = html.match(/"publicWebsite"\s*:\s*"([^"]+)"/) ?? html.match(/"websiteUrl"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  const names = [squash(ref.slug), squash(companyName ?? "")].filter((n) => n.length >= 3);
  for (const m of html.matchAll(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    try {
      const u = new URL(m[0]);
      if (ATS_HOSTS.test(u.hostname) || NOT_A_COMPANY_SITE.test(u.hostname)) continue;
      const root = squash(registrableDomain(u.hostname).split(".")[0]);
      if (names.some((n) => root === n || (root.length >= 4 && (n.startsWith(root) || root.startsWith(n))))) {
        return `https://${registrableDomain(u.hostname)}`;
      }
    } catch {
      // ignore malformed URLs
    }
  }
  return null;
}

export async function fetchAtsPosting(ref: AtsRef, url: string): Promise<FetchedJob | null> {
  const job =
    ref.type === "lever"
      ? await lever(ref, url)
      : ref.type === "greenhouse"
        ? await greenhouse(ref, url)
        : ref.type === "ashby"
          ? await ashby(ref, url)
          : ref.type === "workable"
            ? await workable(ref, url)
            : await recruitee(ref, url);
  if (!job) return null;
  const postingUrl =
    ref.type === "greenhouse" && url.includes("/embed/")
      ? `https://job-boards.greenhouse.io/${ref.slug}/jobs/${ref.postingId}`
      : url;
  job.companyWebsite = await atsCompanyWebsite(ref, postingUrl, job.company).catch(() => null);
  return job;
}

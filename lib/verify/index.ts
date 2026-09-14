// Stage 3: what can be checked about this company and this posting.
//
// The output is a list of checked facts, never a verdict on legitimacy. There is
// no "verified" badge and no trust score anywhere in this module, and a test
// asserts none of that language ever appears in its output. A confident label
// on thin evidence is the worst thing this stage could produce: a green tick on
// a fraudulent posting, or an accusation against a real company.
//
// The single exception is a hard stop: a request for money or identity
// documents before an offer. That is not a judgment call.

import type { FetchedJob } from "@/lib/fetch";
import { registrableDomain } from "@/lib/fetch/ats";
import type { WaitNotice } from "@/lib/llm";
import type { ReadJob } from "@/lib/pipeline/read";
import { findHardStops, isFreeMailDomain, type HardStop } from "@/lib/pipeline/rules";
import { companyFacts, type CompanyFacts, type CompanyType } from "./company";

export type CheckStatus = "confirmed" | "not_confirmed" | "flag";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface Verification {
  domain: string | null;
  companyType: CompanyType;
  companyTypeEvidence: string | null;
  /** One line on what the company type means for the applicant, for staffing and EOR only. */
  companyTypeNote: string | null;
  checks: Check[];
  hardStops: HardStop[];
  questionsToAsk: string[];
  summary: string;
}

export const COMPANY_TYPE_NOTES: Partial<Record<CompanyType, string>> = {
  staffing:
    "Staffing firms usually hire for a client company. The work, the team and how long the role lasts are often decided by that client, not by the firm posting the job.",
  eor: "Employer of Record firms handle payroll and contracts for other companies. You may be employed by them while working for a client they have not named.",
  services: "Services companies build for clients, so the product you work on can change from one project to the next.",
};

function monthsSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (30.44 * 24 * 60 * 60 * 1000);
}

function formatAge(iso: string): string {
  const months = monthsSince(iso);
  if (months < 1) return "less than a month ago";
  if (months < 24) return `${Math.round(months)} months ago`;
  return `${Math.floor(months / 12)} years ago`;
}

const MAIL_LABEL: Record<CompanyFacts["mailProvider"], string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
  zoho: "Zoho Mail",
  other: "their own mail servers",
  none: "",
  unknown: "",
};

const STOPWORDS = new Set(["and", "the", "for", "with", "senior", "junior", "sr", "jr", "i", "ii", "iii", "intern", "internship", "remote", "hybrid", "onsite", "full", "time", "of", "to", "in", "a"]);

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function roleListed(title: string | null, careersText: string): boolean | null {
  if (!title || careersText.trim().length < 200) return null;
  const tokens = titleTokens(title);
  if (!tokens.length) return null;
  const hay = careersText.toLowerCase();
  return tokens.filter((t) => hay.includes(t)).length / tokens.length >= 0.75;
}

function cityOf(location: string | null): string | null {
  if (!location) return null;
  const first = location.split(/[,/|(]/)[0].trim();
  if (!first || /remote|anywhere|worldwide|india|united states|hybrid|onsite/i.test(first)) return null;
  return first;
}

export async function verify(job: FetchedJob, read: ReadJob, onWait?: (n: WaitNotice) => void): Promise<Verification> {
  const checks: Check[] = [];
  const questions: string[] = [];
  const hardStops = findHardStops(job.text);

  const website = job.companyWebsite ?? read.companyWebsite;
  let domain: string | null = null;
  let facts: CompanyFacts | null = null;
  if (website) {
    try {
      const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
      domain = registrableDomain(url.hostname);
      facts = await companyFacts(url.href, onWait);
    } catch (err) {
      console.error("[verify] company checks failed:", err);
    }
  }

  if (!facts) {
    checks.push({
      id: "website",
      label: "Company website",
      status: "not_confirmed",
      detail: website
        ? `Could not load ${website}, so the company checks did not run.`
        : "The posting does not name the company's website, so the company checks did not run.",
    });
    questions.push("What is the company's website?");
  } else {
    checks.push(
      facts.resolves && facts.homepageStatus && facts.homepageStatus < 400
        ? { id: "domain", label: "Website", status: "confirmed", detail: `${facts.domain} is live.` }
        : { id: "domain", label: "Website", status: "flag", detail: `${facts.domain} did not load.` },
    );

    if (facts.registeredAt) {
      const young = monthsSince(facts.registeredAt) < 6;
      checks.push({
        id: "domain_age",
        label: "Domain age",
        status: young ? "flag" : "confirmed",
        detail: `Registered ${formatAge(facts.registeredAt)}.`,
      });
      if (young) questions.push("How long has the company been operating, and under what name before this domain?");
    } else {
      checks.push({
        id: "domain_age",
        label: "Domain age",
        status: "not_confirmed",
        detail: "The registry does not publish a registration date for this domain.",
      });
    }

    if (facts.mailProvider === "none") {
      checks.push({ id: "mail", label: "Company email", status: "flag", detail: `${facts.domain} has no mail records, so it cannot receive email.` });
    } else if (facts.mailProvider === "unknown") {
      checks.push({ id: "mail", label: "Company email", status: "not_confirmed", detail: "Mail records could not be looked up." });
    } else {
      checks.push({ id: "mail", label: "Company email", status: "confirmed", detail: `Mail for ${facts.domain} runs on ${MAIL_LABEL[facts.mailProvider]}.` });
    }

    const pagesFound = (["about", "contact", "careers"] as const).filter((k) => facts!.pages[k]);
    checks.push(
      pagesFound.length >= 2
        ? { id: "site", label: "Site pages", status: "confirmed", detail: `Has ${pagesFound.join(", ")} pages.` }
        : {
            id: "site",
            label: "Site pages",
            status: "not_confirmed",
            detail: pagesFound.length ? `Only found a ${pagesFound[0]} page.` : "No about, contact or careers page was found.",
          },
    );

    const city = cityOf(read.location);
    if (city) {
      const mentioned = facts.siteText.toLowerCase().includes(city.toLowerCase());
      checks.push({
        id: "office",
        label: "Stated office",
        status: mentioned ? "confirmed" : "not_confirmed",
        detail: mentioned ? `Their site mentions ${city}.` : `Their site does not mention ${city}.`,
      });
      if (!mentioned) {
        // Product companies often do not list offices at all; for them the
        // useful question is only where the team sits. The client-site question
        // is for firms whose business is placing people elsewhere.
        const placesPeople = facts.companyType !== "product";
        questions.push(placesPeople ? `Is the role based at your ${city} office, or placed at a client site?` : `Where does the team in ${city} work from?`);
      }
    }

    if (job.tier === "ats") {
      checks.push({ id: "listed", label: "Role listed", status: "confirmed", detail: `Listed on their ${job.sourceLabel} job board.` });
    } else {
      const listed = roleListed(read.title, facts.careersText);
      if (listed === true) {
        checks.push({ id: "listed", label: "Role listed", status: "confirmed", detail: "The role appears on their careers page." });
      } else {
        checks.push({
          id: "listed",
          label: "Role listed",
          status: "not_confirmed",
          detail:
            listed === false
              ? "The role is not on their careers page. That is common, since posts often go up before websites are updated."
              : "Their careers page could not be read.",
        });
        if (listed === false) questions.push("Is this role listed on your website or job board?");
      }
    }

    if (facts.socialLinks.length) {
      checks.push({ id: "social", label: "Social profiles", status: "confirmed", detail: "Their site links to company profiles on LinkedIn or X." });
    }
  }

  const contactEmails = read.applyEmail ? [read.applyEmail.toLowerCase(), ...read.emails] : read.emails;
  const contact = [...new Set(contactEmails)][0];
  if (contact) {
    const mailDomain = contact.split("@")[1] ?? "";
    if (isFreeMailDomain(mailDomain)) {
      checks.push({ id: "contact", label: "Application address", status: "flag", detail: `Applications go to a personal ${mailDomain} address.` });
      questions.push("Can you send the role details from a company email address?");
    } else if (domain && registrableDomain(mailDomain) === domain) {
      const roleInbox = /^(info|contact|hello|support|helpdesk|admin|office)@/.test(contact);
      checks.push({
        id: "contact",
        label: "Application address",
        status: "confirmed",
        detail: roleInbox ? `Applications go to ${contact}, a general inbox on the company domain.` : `Applications go to ${contact}, on the company domain.`,
      });
    } else {
      checks.push({
        id: "contact",
        label: "Application address",
        status: "not_confirmed",
        detail: `Applications go to ${contact}, which is not on ${domain ?? "the company's domain"}.`,
      });
    }
  }

  const specifics = [read.stack.length > 0, Boolean(read.location) || read.workMode !== "unknown", Boolean(read.seniority) || read.yearsRequired !== null];
  const specificCount = specifics.filter(Boolean).length;
  const missing = (["stack", "location", "level"] as const).filter((_, i) => !specifics[i]);
  checks.push({
    id: "specificity",
    label: "Posting detail",
    status: specificCount === 3 ? "confirmed" : "not_confirmed",
    detail:
      specificCount === 3
        ? "Names the stack, the location and the level."
        : `Does not name the ${missing.join(" or the ")}.`,
  });
  if (!specifics[0]) questions.push("What stack will this role work in?");
  if (!specifics[1]) questions.push("Where is the role based, and is remote work possible?");

  const companyType = facts?.companyType ?? "unknown";
  if (companyType === "staffing" || companyType === "eor") {
    questions.unshift("Which company would I be working for day to day, and who would employ me?", "Is this a permanent role or a contract placement?");
  }

  return {
    domain,
    companyType,
    companyTypeEvidence: facts?.companyTypeEvidence ?? null,
    companyTypeNote: COMPANY_TYPE_NOTES[companyType] ?? null,
    checks,
    hardStops,
    questionsToAsk: [...new Set(questions)].slice(0, 5),
    summary: summarize(checks, companyType, hardStops),
  };
}

function summarize(checks: Check[], type: CompanyType, hardStops: HardStop[]): string {
  if (hardStops.length) return "The posting asks for money or documents before an offer.";
  const confirmed = checks.filter((c) => c.status === "confirmed").length;
  const flagged = checks.filter((c) => c.status === "flag").length;
  const parts = [`${confirmed} of ${checks.length} checks confirmed`];
  if (flagged) parts.push(`${flagged} worth a look`);
  const typeLabel: Record<CompanyType, string> = {
    product: "a product company",
    services: "a services company",
    staffing: "a staffing company",
    eor: "an Employer of Record firm",
    unknown: "",
  };
  const prefix = type !== "unknown" ? `Their site describes them as ${typeLabel[type]}. ` : "";
  return `${prefix}${parts.join(", ")}.`;
}

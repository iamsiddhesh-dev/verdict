// Deterministic checks over a job's text. Pure functions: no model call is
// spent on anything a regular expression can decide, and these are the checks
// that must never drift.

/** The strictest "N years of experience" requirement in a JD, or null. Lifted from startHunt. */
export function requiredYears(text: string | null): number | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  let max: number | null = null;
  for (const m of lower.matchAll(/(\d{1,2})\s*\+?\s*(?:-|to)?\s*(?:\d{1,2}\s*)?\+?\s*years?/g)) {
    const n = Number(m[1]);
    if (n < 1 || n > 20) continue;
    const idx = m.index ?? 0;
    const ctx = lower.slice(Math.max(0, idx - 45), idx + m[0].length + 30);
    if (/experience|background|professional|industry|track record|hands-on|yoe/.test(ctx) && !/founded|old|company|team of|combined/.test(ctx)) {
      max = Math.max(max ?? 0, n);
    }
  }
  return max;
}

const ACTIVE_STUDENT_RX =
  /currently (?:pursuing|enrolled)|must be enrolled|actively enrolled|expected graduation|anticipated graduation|graduating in \d{4}|current(?:ly)? (?:a )?(?:university|college) student|penultimate.year|final.year student|pre-final year/i;

/** A role that only takes people who are still studying. Lifted from startHunt. */
export function requiresActiveEnrollment(text: string | null): boolean {
  return Boolean(text && ACTIVE_STUDENT_RX.test(text));
}

// Requests for money or identity documents before an offer. This is the one
// place the product takes a position: it stops and says so. The patterns are
// narrow on purpose, and each one is checked for a nearby negation, because
// "there is no registration fee" is a common and reassuring sentence.
const FEE_PATTERNS: RegExp[] = [
  /(registration|security|training|processing|onboarding|joining|application|interview|kit|verification|placement|refundable|caution)\s+(fee|fees|deposit|charges?|amount)/i,
  /(pay|deposit|transfer)\s+(?:a\s+|the\s+)?(?:(?:small|one[- ]time|nominal|refundable)\s+)?(?:fee|amount|sum|rs\.?|inr|₹|\$)/i,
  /(?:₹|rs\.?|inr)\s?\d[\d,]*\s*(?:\/-)?\s*(?:as|for|towards)\s+(?:registration|training|security|kit|processing)/i,
];
const DOCUMENT_PATTERNS: RegExp[] = [
  /(send|share|submit|upload|provide)\s+(?:your\s+|a\s+copy\s+of\s+(?:your\s+)?)?(aadhaa?r|pan\s*card|passport|bank\s+(?:account|details|statement)|debit\s+card|credit\s+card|otp|ssn|social security)/i,
  /(aadhaa?r|pan\s*card|bank\s+(?:account|details)|passport)\s+(?:details|copy|number)?\s*(?:is|are)\s+(?:required|mandatory)\s+(?:to|for)\s+(?:apply|applying|register|shortlist|the interview)/i,
];
const NEGATION = /\b(no|never|not|without|free of|zero|don't|do not|will not|won't|nor)\b[^.!?\n]{0,40}$/i;

export interface HardStop {
  kind: "fee" | "documents";
  quote: string;
}

function sentenceAround(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf("\n", index) + 1, text.lastIndexOf(". ", index) + 2);
  const endCandidates = [text.indexOf("\n", index + length), text.indexOf(". ", index + length)].filter((i) => i >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) + 1 : text.length;
  return text.slice(start, Math.min(end, start + 240)).trim();
}

export function findHardStops(text: string): HardStop[] {
  const out: HardStop[] = [];
  const scan = (patterns: RegExp[], kind: HardStop["kind"]) => {
    for (const rx of patterns) {
      const m = rx.exec(text);
      if (!m || m.index === undefined) continue;
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      if (NEGATION.test(before)) continue;
      out.push({ kind, quote: sentenceAround(text, m.index, m[0].length) });
      break;
    }
  };
  scan(FEE_PATTERNS, "fee");
  scan(DOCUMENT_PATTERNS, "documents");
  return out;
}

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "rediffmail.com",
  "protonmail.com",
  "proton.me",
  "icloud.com",
  "aol.com",
  "zoho.com",
  "mail.com",
  "gmx.com",
  "yandex.com",
]);

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL.has(domain.toLowerCase());
}

export function emailsIn(text: string): string[] {
  return [...new Set((text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))];
}

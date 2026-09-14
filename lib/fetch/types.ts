export type AtsType = "greenhouse" | "lever" | "ashby" | "workable" | "recruitee";

export type FetchTier = "ats" | "structured" | "html" | "paste" | "screenshot";

/** One job posting, however it was obtained. */
export interface FetchedJob {
  tier: FetchTier;
  source: AtsType | "web" | "paste" | "screenshot";
  /** Human label for the run log: "Lever", "the company's careers page". */
  sourceLabel: string;
  url: string | null;
  title: string | null;
  company: string | null;
  /** The company's own site when it can be established from the posting itself. */
  companyWebsite: string | null;
  location: string | null;
  isRemote: boolean | null;
  employmentType: string | null;
  salary: string | null;
  postedAt: string | null;
  /** Plain text of the description. Everything downstream reads this. */
  text: string;
}

export type FetchBlockReason = "linkedin" | "social" | "login" | "bot_check" | "not_found" | "unreadable" | "invalid_url";

export type FetchOutcome =
  | { ok: true; job: FetchedJob }
  | { ok: false; reason: FetchBlockReason; message: string; url: string };

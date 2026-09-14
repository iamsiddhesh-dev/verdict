// Machine checks on everything the agent writes for a person to send.
//
// Prompts drift and models comply unevenly; these checks do not. Every generated
// answer, message and resume line passes through here before anyone sees it, and
// failures go back to the model as corrections. Text that still fails after the
// retries is shown with its problems listed, never passed off as clean.
//
// The rules come from how real applications were written by hand:
//   - claim only what the profile shows: no invented skills, tools or numbers
//   - no sweeping claims and no comparisons with other candidates or the industry
//   - no volunteered weaknesses (omitting a gap is fine; claiming a skill is not)
//   - no em or en dashes, which read as machine-written and get pasted verbatim
//   - no leftover template placeholders

export interface HonestySource {
  /** Everything true about the candidate: resume text, parsed facts, their notes. */
  profileText: string;
  /** The posting. Company facts may be mentioned; they may not be claimed as the candidate's. */
  jobText: string;
}

export interface Issue {
  rule: "invented_term" | "invented_number" | "placeholder" | "dash" | "comparison" | "hype" | "volunteered_gap" | "length" | "lost_detail";
  message: string;
}

// Technology names that commonly get "helpfully" added to applications. Only
// terms on this list are policed, so ordinary words never trigger a false
// positive. Matching is case-insensitive on word boundaries.
const TECH_TERMS = [
  "javascript", "typescript", "python", "java", "kotlin", "golang", "c\\+\\+", "c#", "ruby", "php", "scala", "elixir", "sql",
  "react", "react native", "next\\.js", "nextjs", "vue", "nuxt", "angular", "svelte", "sveltekit", "tanstack", "redux", "zustand",
  "tailwind", "sass", "gsap", "framer motion", "three\\.js", "webgl", "webgpu", "d3\\.js", "flutter", "electron", "tauri",
  "node\\.js", "nodejs", "nestjs", "fastify", "deno", "django", "flask", "fastapi", "ruby on rails", "spring boot", "laravel", "asp\\.net",
  "graphql", "grpc", "trpc", "websockets?", "webrtc", "kafka", "rabbitmq", "celery", "redis", "bullmq", "sidekiq",
  "postgresql", "postgres", "mysql", "mongodb", "sqlite", "dynamodb", "cassandra", "elasticsearch", "opensearch", "clickhouse", "snowflake", "bigquery", "supabase", "firebase", "prisma", "drizzle", "pgvector", "pinecone", "weaviate", "qdrant",
  "aws", "gcp", "azure", "ec2", "cloudflare", "vercel", "netlify", "heroku", "fly\\.io",
  "docker", "kubernetes", "k8s", "terraform", "ansible", "jenkins", "github actions", "gitlab ci", "circleci", "nginx",
  "pytorch", "tensorflow", "keras", "scikit-learn", "sklearn", "pandas", "numpy", "hugging ?face", "langchain", "langgraph", "llamaindex", "crewai", "vllm", "ollama", "rlhf",
  "airflow", "hadoop", "flink",
  "sentry", "datadog", "grafana", "prometheus", "new relic", "opentelemetry",
  "twilio", "shopify", "salesforce", "hubspot",
  "playwright", "cypress", "selenium", "jest", "vitest", "pytest", "storybook",
  "solidity", "web3", "ethereum", "blockchain",
  "swiftui", "jetpack compose",
  "ffmpeg", "webcodecs", "web workers", "webassembly",
];

// Names that are also ordinary English words ("go ahead", "the rest", "render
// it", "express interest"). These only count when capitalised as a proper noun
// and not at the start of a sentence, where every word is capitalised.
const AMBIGUOUS_TERMS = [
  "Go", "Rust", "Swift", "Dart", "Express", "Spring", "Rails", "Remix", "Astro", "Solid", "Bun", "Hono", "REST", "Expo",
  "Lambda", "S3", "Railway", "Render", "Helm", "Linux", "Spark", "dbt", "RAG", "Llama", "Gemini", "Groq", "Mistral", "OpenAI", "Anthropic",
  "Chroma", "Stripe", "Razorpay", "Zoho", "Figma", "Jira", "iOS", "Android", "WASM",
];

const TERM_RX = [
  ...TECH_TERMS.map((t) => ({ term: t.replace(/\\/g, ""), rx: new RegExp(`(?<![\\w.])${t}(?![\\w])`, "i"), ambiguous: false })),
  ...AMBIGUOUS_TERMS.map((t) => ({ term: t, rx: new RegExp(`(?<![\\w.])${t}(?![\\w])`), ambiguous: true })),
];

function appearsMidSentence(sentence: string, rx: RegExp): boolean {
  const m = sentence.trim().match(rx);
  return Boolean(m && (m.index ?? 0) > 0);
}

const FIRST_PERSON = /\b(i|i've|i'm|i'd|my|me|we built|i built|worked with|experience (?:with|in)|proficient|skilled|familiar with|used)\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
}

function norm(s: string) {
  return s.toLowerCase();
}

export function inventedTerms(output: string, src: HonestySource): string[] {
  const profile = norm(src.profileText);
  const job = norm(src.jobText);
  const found = new Set<string>();
  for (const sentence of sentences(output)) {
    for (const { term, rx, ambiguous } of TERM_RX) {
      if (!rx.test(sentence)) continue;
      if (ambiguous && !appearsMidSentence(sentence, rx)) continue;
      const inProfile = ambiguous ? rx.test(src.profileText) : rx.test(profile);
      if (inProfile) continue;
      // Naming the company's own stack is fine ("you are hiring for Go"), but
      // not inside a sentence where the candidate claims it.
      const inJob = ambiguous ? rx.test(src.jobText) : rx.test(job);
      if (inJob && !FIRST_PERSON.test(sentence)) continue;
      found.add(term);
    }
  }
  return [...found];
}

export function inventedNumbers(output: string, src: HonestySource): string[] {
  const allowed = `${src.profileText}\n${src.jobText}`.replace(/,(?=\d{3})/g, "");
  const out = new Set<string>();
  for (const m of output.replace(/,(?=\d{3})/g, "").matchAll(/\d+(?:\.\d+)?/g)) {
    const n = m[0];
    // Single digits are nearly always ordinary counting ("two projects", "3 steps").
    if (n.length === 1) continue;
    if (!new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`).test(allowed)) out.add(n);
  }
  return [...out];
}

const COMPARISON = /\b(most|many|other|typical|average)\s+(candidates|applicants|engineers|developers|people|agent projects|teams|companies)\b|\bunlike (?:most|other|many)\b|\bstand(?:s)? out from\b|\bbetter than (?:most|other)\b|\balmost nobody\b|\bnobody else\b|\bthe rest of the (?:field|industry)\b/i;

const HYPE = /\b(passionate|thrilled|excited to|dream (?:job|role|company)|perfect fit|ideal candidate|rockstar|ninja|guru|world-?class|cutting-?edge|game-?changer|synerg(?:y|ies)|leverage[ds]?|spearheaded|revolutioniz\w*|unparalleled|best-in-class|i am confident that i|delighted|seamless(?:ly)?|robust and scalable|deeply (?:passionate|excited))\b/i;

const GAP = /\b(i (?:do not|don't|have not|haven't|lack|am not yet)\b[^.]{0,60}\b(experience|worked|used|familiar)|although i (?:lack|have not|haven't|don't)|while i (?:am new to|have limited|lack)|limited experience|no (?:prior |professional )?experience (?:with|in)|still learning|not an expert)\b/i;

export interface CheckOptions {
  maxChars?: number;
  label?: string;
}

export function checkText(output: string, src: HonestySource, opts: CheckOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const where = opts.label ? `In the ${opts.label}: ` : "";

  const terms = inventedTerms(output, src);
  if (terms.length) {
    issues.push({
      rule: "invented_term",
      message: `${where}${terms.join(", ")} ${terms.length === 1 ? "is" : "are"} not in the candidate's profile. Remove every mention, and do not replace it with another skill they do not have.`,
    });
  }
  const numbers = inventedNumbers(output, src);
  if (numbers.length) {
    issues.push({
      rule: "invented_number",
      message: `${where}the numbers ${numbers.join(", ")} do not appear in the profile or the posting. Use only numbers that are there, or no number.`,
    });
  }
  const placeholders = output.match(/\[[^\]\n]{1,80}\]|\{\{[^}]+\}\}|<[A-Z][A-Z _]{2,}>/g);
  if (placeholders) {
    issues.push({ rule: "placeholder", message: `${where}unfilled placeholders: ${[...new Set(placeholders)].join(", ")}. Write the real detail or remove the clause.` });
  }
  if (/[—–]|[ \t]-{1,2}[ \t]/.test(output.replace(/^[ \t]*[-*][ \t]+/gm, ""))) {
    issues.push({ rule: "dash", message: `${where}do not use dashes as punctuation. Use a comma, a full stop or rewrite the sentence.` });
  }
  const comparison = output.match(COMPARISON);
  if (comparison) {
    issues.push({ rule: "comparison", message: `${where}"${comparison[0]}" compares the candidate with others. Describe only the candidate's own work.` });
  }
  const hype = output.match(HYPE);
  if (hype) {
    issues.push({ rule: "hype", message: `${where}"${hype[0]}" is filler or hype. State what was built and what it did instead.` });
  }
  const gap = output.match(GAP);
  if (gap) {
    issues.push({ rule: "volunteered_gap", message: `${where}"${gap[0]}" volunteers a weakness. Leave gaps out; talk about what the candidate has done.` });
  }
  if (opts.maxChars && output.length > opts.maxChars) {
    issues.push({ rule: "length", message: `${where}${output.length} characters; the limit is ${opts.maxChars}. Shorten it.` });
  }
  return issues;
}

/**
 * Dashes are the one rule fixed in code rather than sent back: the rewrite is
 * mechanical and a retry for it would spend a scarce writing request.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/\s*[—]\s*/g, ", ")
    .replace(/(\d)\s*[–]\s*(\d)/g, "$1 to $2")
    .replace(/[ \t]+[–][ \t]+/g, ", ")
    .replace(/(?<=\S)[ \t]+-{1,2}[ \t]+/g, ", ")
    .replace(/,\s*,/g, ",");
}

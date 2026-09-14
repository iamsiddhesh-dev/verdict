# Job Application Agent — implementation plan

## Context

Across one long session, a repeatable workflow emerged: Siddhesh pastes a job link, the
job gets read and judged against his real background, roles that do not fit are rejected
with reasons, and for the ones that do fit a tailored resume, application answers and
outreach messages get written. It worked well enough that he wants it as a product for
other applicants.

The work is mechanical enough to automate and valuable enough that people do it badly by
hand every day. The differentiator is not "AI writes your resume" — that exists and is
mostly slop. It is **the verdict**: telling someone honestly that a role is not worth
applying to, and never putting a skill on their resume that they do not have.

startHunt already contains roughly 60% of the machinery, because it solves the inverse
problem (find jobs for a person). This project reuses those parts and inverts the flow.

**Decisions already made by the user:** hosted multi-user product; ATS APIs plus a
headless browser for fetching; resume output is a tailored `.tex` **and** an
auto-compiled PDF; all four stages ship, but gated — the expensive ones only unlock
after a positive verdict.

---

## Product shape

The gating is the spine, not a UI detail. Scoring is cheap; tailoring, answers and
outreach are expensive. Gating them behind the verdict saves quota, matches how someone
actually decides, and makes the product's honesty legible.

```
link / screenshot / pasted text
        │
        ▼
     FETCH ──► VERIFY ──► SCORE ──► verdict
                  │                    │
           trust signal        skip / borderline ──► gaps + reasons, STOP
        (shown either way)             │
                                    apply
                                       ▼
                      ┌────────────────┼────────────────┐
                   RESUME          ANSWERS          OUTREACH
                (.tex + PDF)   (why you / why us   (LinkedIn, X,
                                + pasted form Qs)     email)
```

VERIFY runs on every job regardless of verdict, because "is this real, and is it what it
says it is" stays useful even when the answer to "should I apply" is no.

Each unlocked stage is run on demand, not automatically. The user clicks "tailor resume";
they do not get three LLM bills for clicking one link.

---

## Architecture

**One container on Railway**, not Vercel. This is forced, not preference: Playwright needs
a real browser binary and LaTeX needs a TeX distribution, neither of which survives
serverless. A single container also makes WebSockets trivial, which Vercel cannot do at all.

```
Next.js 16 (custom server: next + ws)          ← UI, API routes, WebSocket server
   ├── Postgres (Supabase) + Drizzle           ← users, profiles, runs, artifacts, quotas
   ├── Supabase Auth                           ← anonymous-first, Google to upgrade
   ├── in-process worker loop                  ← bounded concurrency over run rows
   ├── Playwright (chromium)                   ← fetch tier 3
   └── Tectonic                                ← LaTeX → PDF
```

**Job execution:** a `runs` table is the queue. The worker loop claims rows with
`FOR UPDATE SKIP LOCKED`, bounded by `mapLimit` from `lib/sources/http.ts`. No Redis in v1
— it is another service to run and the volume does not need it. Durable because state is
in Postgres: a container restart leaves a `running` row that is reclaimed after a lease
timeout. Upgrade path to BullMQ is a swap of the claim function, nothing else.

**WebSockets:** one connection per browser tab, authenticated with the Supabase JWT on
connect. Server pushes `{ runId, stage, status, detail }` as each stage transitions. The
run row is the source of truth — the socket is an accelerator, and the UI must still
render correctly from a plain fetch on reconnect. Do not put state only in the socket.

---

## Data model (Drizzle, Postgres)

Reuse startHunt's shapes where they fit.

| Table | Purpose |
|---|---|
| `users` | Supabase auth uid, anonymous-first. Copy startHunt's `users` including the anon→Google claim logic |
| `profiles` | Parsed resume facts, GitHub, LinkedIn text, master `.tex` source, embedding |
| `jobs` | One row per fetched job. `NormalizedJob` shape from `lib/sources/types.ts`, plus `fetchTier` and `rawText` |
| `runs` | One per pasted link. `status`, `stage`, `verdict`, `score`, claim lease columns |
| `scores` | `score`, `gaps[]`, `leadProof`, `rationale`, `verdict` |
| `verifications` | One per job. `companyType`, `checks` jsonb, `hardStops[]`, `checkedAt`. Cache per company domain, not per job, since domain and MX results are stable |
| `artifacts` | Generated outputs: `kind` (`resume_tex`, `resume_pdf`, `answers`, `outreach`), content or storage path |
| `usage_counters` | Lift `lib/usage/quota.ts` verbatim; rename actions to `fetch \| score \| tailor \| answers \| outreach` |
| `llm_cache` | Lift `lib/llm/cache.ts` design: key on `(task, sha256(prompt))` |
| `user_api_keys` | BYOK, AES-256-GCM bound to `(user_id, provider)` as AAD. Copy `lib/keys/` |

---

## Stage 1 — Fetch

Four tiers, tried in order, each falling through to the next:

1. **ATS API.** Take the URL patterns from `lib/sources/resolve-ats.ts` (`PATTERNS`,
   `RESERVED`) to extract `(atsType, companySlug, postingId)`, then call the
   **per-posting** endpoint. These are not implemented in startHunt and are the main new
   code here: Lever `/v0/postings/{slug}/{id}`, Greenhouse
   `/v1/boards/{slug}/jobs/{id}?content=true`, Ashby's posting endpoint. Fall back to the
   existing whole-board `fetchJobs(type, slug)` from `lib/sources/ats/index.ts` and match
   on posting id. Return `NormalizedJob`.
2. **Plain fetch + readability.** For ordinary HTML (company career pages, Notion). Use
   `fetchText` from `lib/sources/http.ts`, then extract main content.
3. **Playwright.** JS-rendered pages. Real browser, realistic UA, wait for network idle.
4. **Paste fallback.** Always available in the UI, and the only path for gated pages.
5. **Screenshot.** A large share of job posts circulate as images on X and LinkedIn. Accept
   an uploaded image and read the text out of it with a vision model. Treat the result as
   lower confidence than a fetched page: show the extracted text back for confirmation
   before scoring, because an OCR error in a salary figure or a required skill is worse
   than no reading at all. This is how the post that prompted this feature arrived.

**Honest failure is a feature.** When a page is behind a login, a CAPTCHA or a bot check,
the agent says so plainly and opens the paste box. It does not attempt to solve CAPTCHAs,
does not create accounts, and does not fetch LinkedIn (their terms prohibit it). These are
hard exclusions in code, not guidelines — keep a host denylist.

**Expect tier 3 to fail more in production than in local testing.** Cloudflare treats
datacenter IPs far more harshly than a home connection; Wellfound already blocked plain
`curl` during the session that inspired this. Design the UI so the paste fallback feels
like a normal path rather than an error state.

## Stage 1.5 — Verify

Runs after fetch, before scoring, on **every** job. Output is a trust signal shown next
to the verdict whether the verdict is Apply or Skip.

This stage exists because of a real case: a job post on X for an "AI Engineer, Fresher,
Pune" looked ordinary. The company domain was real and its mail ran on Microsoft 365, so
it was not a scam. But the role was absent from the company's own careers page, the
recruiter address was not among the published ones, and the company's own site described
it as a talent acquisition, payroll and Employer of Record business. The job was probably
real and probably not what the post implied: a placement at an unnamed client rather than
a seat on an engineering team. No amount of resume tailoring surfaces that. A verification
pass does.

### Checks

**Company signals** (cheap, no LLM):

| Check | Method | What it tells you |
|---|---|---|
| Domain resolves | DNS A record, HTTP status | The company has a web presence at all |
| Domain age | WHOIS creation date | A domain registered three weeks ago warrants caution |
| Mail setup | MX lookup | Google Workspace or Microsoft 365 means somebody pays for email. No MX, or a free provider, is a signal |
| Site substance | Presence of About, Contact, Services pages; page count | Distinguishes a real company from a one-page shell |
| Stated office | Contact page, matched against the job's stated city | A Pune role at a company with a Pune office is consistent |
| Social presence | LinkedIn company page, X account | Corroboration, not proof |

**Posting signals:**

| Check | Method | What it tells you |
|---|---|---|
| Role on careers page | Fetch the careers page, keyword match on title and location | Listed is reassuring. Not listed is common and not damning, since social posts outrun website updates |
| Contact address | Compare the application email's domain to the company domain | A free-mail address for a corporate role is a signal. A role-based inbox like helpdesk@ or info@ for hiring is a weaker one |
| Specificity | Does the post name a stack, a location, a seniority? | Posts with none of these are usually recruiter volume-posting and rarely convert |
| Hard stops | Requests for fees, payment, identity documents or bank details before an offer | Stop and warn. No exceptions |

**Company type** (one small LLM call over the site's own copy):

Classify as `product`, `services / consultancy`, `staffing / recruitment`, `EOR / payroll`,
or `unknown`. This is the highest-value output of the whole stage and it is not about
fraud. It changes what the job actually is. A staffing firm hiring an "AI Engineer" is
usually recruiting for a client, which affects who you work for, what you build, and what
happens when the contract ends. Surface it plainly and let the user decide.

### Output contract

```
verification: {
  companyType: 'product' | 'services' | 'staffing' | 'eor' | 'unknown',
  checks: [ { id, label, status: 'confirmed' | 'not_confirmed' | 'flag', detail } ],
  hardStops: string[],
  questionsToAsk: string[],
}
```

### The rule that keeps this honest

**Never output a verdict on legitimacy.** No "SCAM" badge, no "VERIFIED" badge, no trust
score out of 100. Publishing a confident accusation about a named company on evidence this
thin is both wrong and legally reckless, and a green "verified" tick is worse because it
manufactures confidence the checks do not support.

Output **checked facts and what could not be checked**, in the same register as the rest of
the product: "Domain and mail records are real. This role is not listed on their careers
page. Their site describes them as a staffing and payroll company." Then give the user the
questions worth asking. The user draws the conclusion.

`hardStops` is the single exception. A request for money or documents up front is not a
judgment call, and the product should refuse to help with the application and say why.

## Stage 2 — Score and verdict

Adapt `rerankSchema` and `rerankPrompt` from `lib/agent/match.ts` for a single job. Drop
`jobIndex`, `hiringSignal` and `vectorScore` (there is no corpus to rank against, and the
prompt's "already pre-filtered" line must go). Keep `score`, `gaps[]`, `leadProof`,
`leadProofType`, `standoutProject`, `rationale`.

Lift `requiredYears()` and `requiresActiveEnrollment()` directly — they are pure functions
and they catch hard disqualifiers before an LLM call is spent.

Verdict bands, surfaced with reasons:

| Score | Verdict | Behaviour |
|---|---|---|
| ≥ 70 | **Apply** | Unlock resume, answers, outreach |
| 55–69 | **Borderline** | Show gaps; user may unlock manually |
| < 55 | **Skip** | Downstream stages stay locked. Say which requirements are missing |

A hard disqualifier (a must-have language the profile lacks, an active-enrollment
requirement) forces **Skip** regardless of score. This is the behaviour that made the
manual version useful: five of the roles reviewed in session were correctly rejected on a
single missing must-have.

## Stage 3 — Tailored resume

Input: the user's master `.tex` (uploaded once at onboarding) plus parsed `ResumeFacts`.

1. **Select** which experience and project blocks to include, ranked by relevance to this
   job. The master file keeps unused blocks commented, exactly as the session's files do.
2. **Rewrite** bullets into the employer's vocabulary. Hard constraint: rephrase only, never
   introduce a fact. The prompt receives the master content and is told it may not add.
3. **Validate** (below) before anything is compiled.
4. **Compile** with Tectonic, then **auto-fit**: count pages; if over one, trim using a
   declared priority order and recompile. Cap at 3 attempts, then return the .tex with a
   note rather than a silently overflowing PDF.

The auto-fit loop is the piece that makes this feel like an agent rather than a prompt. It
is also directly modelled on the repair loop in `lib/agent/drafts.ts` and the tiered
validation in workflow-to-agent-converter.

## Stage 4 — Application answers

Lift the structure of `generateDrafts()` from `lib/agent/drafts.ts` wholesale, replacing
`draftSchema` and the voice block. Two inputs: standard questions (why you, why this
company) and **pasted custom questions** — the field that covers Google Forms, Ashby,
Tally and anything else gated.

Keep its correction loop verbatim: generate, run machine checks, feed failures back as
`FIX THESE PROBLEMS FROM YOUR PREVIOUS ATTEMPT`, up to 3 attempts.

## Stage 5 — Outreach

Same generator, three variants with different constraints: LinkedIn (300 chars, reuse
`LINKEDIN_MAX_CHARS`), X DM (short, no links in first message), cold email (subject + body).
Only offered when a named contact exists or the user supplies one.

---

## The honesty layer (the actual differentiator)

Every generated artifact passes machine checks before the user sees it. Model this on
recoup's copy validator and Vibely's ten structural rules.

- **No invented facts.** Every skill, employer, tool and number in a tailored resume must
  appear in the master profile. Implement as a term-level check over the diff, not a vibe
  check: extract candidate nouns from generated text, assert each is present in the master
  source. Anything unmatched is a hard failure fed back to the correction loop.
- **No fabricated numbers.** Any digit run in generated output must exist in the source,
  the same rule recoup's case explainer uses.
- **No leftover placeholders.** Reuse `findPlaceholders()` / `PLACEHOLDER_RX`.
- **Tone rules**, from the user's stated preferences: no claims about other candidates or
  the industry, no volunteered weaknesses, no em dashes. These are lint rules, not prompt
  suggestions, because prompts drift and regexes do not.
- **Length caps** per surface.

A generated artifact that fails validation three times is shown with its problems listed
rather than silently returned. Failing loudly is the product promise.

---

## Free-tier strategy

Copy startHunt's approach; it is already proven under real traffic.

- `lib/llm/index.ts` lifts whole, minus its two `./cache` imports. Rename `LlmTask` to
  `score | tailor | answers | outreach | resumeExtraction | hardening`.
- Keys as the **inner** loop, models as the outer one. Keep `shouldFailOver`,
  `looksLikeQuotaOrServerError` and `isKeyRejected` verbatim — each encodes a real incident.
- Prompt-hash caching with per-task TTLs. Do **not** cache the correction loops; they build
  a different prompt every attempt and would never hit.
- Postgres-backed quotas via the atomic `INSERT … ON CONFLICT … WHERE count < limit`
  statement. An in-memory limiter is wrong here for the same reason it was wrong in
  startHunt.
- BYOK, per provider, used exclusively when present so the quota exemption is truthful.
- The gating already saves the most quota: a Skip verdict costs one scoring call instead of
  four generation runs.

---

## Reuse map

**Lift unmodified** (no DB coupling):
- `C:\skr\starthunt\lib\profile\resume.ts` — PDF/DOCX/TXT extraction, `ResumeFacts` schema, two-pass extract + harden
- `C:\skr\starthunt\lib\agent\drafts.ts` — generator plus validate/correct loop
- `C:\skr\starthunt\lib\sources\http.ts` — `fetchJson`, `fetchText`, `mapLimit`, timeouts
- `C:\skr\starthunt\lib\sources\ats\*` and `lib\sources\types.ts` — five connectors, `NormalizedJob`
- `C:\skr\starthunt\lib\llm\index.ts` — minus the cache imports
- From `lib\agent\match.ts`: `rerankSchema`, `rerankPrompt`, `profileBlock`, `jobsBlock`, `requiredYears`, `requiresActiveEnrollment`, `linkIsDead`
- From `lib\sources\resolve-ats.ts`: `PATTERNS`, `RESERVED`
- From `lib\profile\merge.ts`: `buildPlayback()`

**Copy the pattern, rewrite the binding:** `lib\usage\quota.ts`, `lib\llm\cache.ts`,
`lib\keys\*`, and the tenancy check in `app\api\drafts\route.ts` (ownership proven before
any read; 404 never 403).

**Build new:** per-posting ATS endpoints, Playwright tier, LaTeX compile and auto-fit loop,
the no-invented-facts validator, WebSocket progress, the run queue, the gated UI.

---

## Build order

1. **Skeleton + auth + WebSocket echo.** Railway container, Next custom server, Supabase
   anonymous auth, a run row that streams fake stage transitions. Proves the hardest
   infrastructure piece first.
2. **Onboarding.** Resume upload → `parseResume` → facts; GitHub, LinkedIn, portfolio,
   master `.tex` upload.
3. **Fetch tiers 1, 2 and 4.** ATS per-posting, plain HTML, paste. Leave Playwright out.
4. **Verify.** DNS, MX, WHOIS, careers-page cross-check and company-type classification.
   Cheap, mostly non-LLM, and independently useful even before scoring works.
5. **Score + verdict + gating.** The whole product value is testable at this point. Stop
   and evaluate here.
6. **Resume tailoring + Tectonic + auto-fit.**
7. **Answers, then outreach.**
8. **Playwright tier 3, then screenshot input.** Last, because they are the most
   fragile and least essential.
9. **Quotas, BYOK, caching** before any public link is shared.

Milestone 5 is the real validation gate. If the verdicts are not trustworthy, nothing
downstream matters.

---

## Explicitly out of scope

- **Creating accounts of any kind.** Against those services' terms and not something this
  project will do. Gated forms are handled by the paste field.
- **Solving CAPTCHAs or bot checks.** Detect, report, fall back to paste.
- **LinkedIn scraping.** Prohibited by their terms. The user pastes LinkedIn JDs.
- **Auto-submitting applications.** The agent prepares; the human sends. Keeps the user in
  control of what goes out under their name and avoids mass-application behaviour that
  employers and platforms both penalise.

---

## Verification

- **Fetch:** a fixture set of ~15 real URLs across all five ATSes plus three non-ATS pages.
  Assert tier selection and that `NormalizedJob` fields are populated. Re-run in CI weekly
  to catch upstream API drift.
- **Score:** build a labelled set from this session — the roles correctly rejected
  (MERN/Go/Java/C++ stacks, in-office mismatches) and the ones correctly recommended
  (Deepvue, Binocs, Avoca, Hevo, SalesMonk). Assert verdicts match. This is a real eval set
  and it is the most valuable test in the project.
- **Honesty validator:** adversarial fixtures where the model is fed a job demanding a skill
  the profile lacks. Assert the generated resume never contains it. This must be a hard
  test, not a spot check.
- **Verify:** fixtures for a known-good product company, a known staffing firm, a domain
  with no MX, and a post whose role is absent from the careers page. Assert the company
  type classification and that **no fixture ever produces a legitimacy verdict** — only
  checked facts. Add a fixture containing an up-front fee request and assert it triggers a
  hard stop.
- **Screenshot input:** a set of real job-post screenshots from X and LinkedIn. Assert the
  extracted text is shown for confirmation before scoring, and that a low-confidence
  extraction never silently proceeds.
- **Auto-fit:** deliberately overlong master file, assert output is one page within 3
  compile attempts.
- **Quotas:** concurrent requests against a limit of 1, assert exactly one succeeds.
- **End to end:** paste a Lever URL, watch the socket stream fetch → score → verdict, unlock
  resume, download the PDF, confirm one page and no invented content.

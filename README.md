<div align="center">

# Verdict

**Know if a job is worth applying to, before you spend an hour on it.**

Paste a job link. Verdict reads the posting, checks the company and scores the role against your real resume.
You get **apply**, **borderline** or **skip**, with the reasons. When it is a fit, it writes your application
answers, outreach messages and a one-page tailored resume, without claiming anything your resume does not show.

Free to use. Free to run. Built entirely on free tiers.

[Report a bug](https://github.com/iamsiddhesh-dev/verdict/issues) · [Request a feature](https://github.com/iamsiddhesh-dev/verdict/issues)

</div>

---

## Why

Verdict starts with the step that comes before writing anything: telling you honestly whether the role is
worth your time. A missing core requirement (the main language the
team works in, a years-of-experience bar, a location restriction) is a skip, however good the rest reads.
The writing tools only unlock after a positive verdict.

## What it does

| Stage | What happens |
|---|---|
| **Fetch** | Reads the posting from Lever, Greenhouse, Ashby, Workable and Recruitee APIs, from structured data on careers pages, or from plain HTML. LinkedIn and X are never scraped: paste the text instead. |
| **Read** | Extracts title, location, work mode, stack, and required versus nice-to-have requirements. |
| **Verify** | Checks the company's domain, mail records, careers page and contact address, and classifies it as product, services, staffing or EOR. Postings that ask for fees or documents before an offer are stopped. No trust score and no "verified" badge: only what was and was not checked. |
| **Score** | Rates work overlap, required skills, seniority and location against fixed anchors. Code, not the model, combines them and applies hard disqualifiers. |
| **Apply** | Answers to application questions within their character limits, a LinkedIn note, an X message and a cold email, and a tailored LaTeX resume compiled to a one-page PDF. |

### The honesty layer

Everything written for you passes machine checks before you see it:

- Every skill, tool and number must appear in your resume. Anything else is sent back for correction.
- No comparisons with other candidates, no hype words, no volunteered weaknesses, no em dashes.
- Resume rewrites must bring in a term the posting actually uses and may not drop a number or tool from the original bullet. Otherwise your own wording is kept.
- A draft that still breaks a rule after three attempts is shown with the problem, never passed off as clean.

## Stack

- **App:** Next.js 16 (App Router) with a custom Node server for WebSockets and an in-process worker
- **Database:** PostgreSQL on Supabase in production, [PGlite](https://pglite.dev) locally with zero setup
- **Auth:** Supabase Auth (Google and email links)
- **Queue:** Postgres rows claimed with `FOR UPDATE SKIP LOCKED`, leases for crash recovery
- **Models:** Groq and Google Gemini, with Mistral and Cerebras as optional fallbacks, behind a router that tracks each free tier's per-minute and per-day budget and waits for capacity instead of failing
- **Resume:** [Tectonic](https://tectonic-typesetting.github.io) for LaTeX to PDF, in untrusted mode
- **UI:** Tailwind CSS 4, Lucide icons

## Run it locally

Requirements: Node.js 22+, and a free API key from [Groq](https://console.groq.com) and [Google AI Studio](https://aistudio.google.com).

```bash
git clone https://github.com/iamsiddhesh-dev/verdict.git
cd verdict
npm install
cp .env.example .env    # add GROQ_API_KEY and GEMINI_API_KEY
npm run dev:offline
```

Open http://localhost:3000. `dev:offline` uses a local database in `.data/` and anonymous browser sessions, so
no Supabase project is needed to try it.

**PDF resumes** need [Tectonic](https://tectonic-typesetting.github.io/book/latest/installation/) on your PATH
(or at `.data/bin/tectonic`). Without it you still get the `.tex`, which compiles in Overleaf.

### With accounts (Supabase)

1. Create a free [Supabase](https://supabase.com) project.
2. In `.env`, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `DATABASE_URL`
   (Connect → **Session pooler**; the direct connection is IPv6-only on the free plan).
3. Authentication → Providers → Google: add a Google OAuth client. Authentication → URL Configuration:
   add `http://localhost:3000/auth/callback` to redirect URLs.
4. `npm run dev`. Migrations run on startup, and row level security locks the tables away from Supabase's public API.

## Deploy

The `Dockerfile` bundles the app, the WebSocket server, the worker and Tectonic into one container
(x86_64 or ARM). `docker-compose.yml` runs it behind [Caddy](https://caddyserver.com), which handles HTTPS.
Any VM with Docker works; an [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/) Ampere VM
runs it at no cost:

```bash
# on a fresh Ubuntu VM, with ports 80 and 443 allowed in the cloud firewall
curl -fsSL https://raw.githubusercontent.com/iamsiddhesh-dev/verdict/main/deploy/setup-server.sh | bash
# log out and back in, then:
cd ~/verdict
nano .env                    # variables from .env.example, plus DOMAIN=your.domain
docker compose up -d --build
```

Point `DOMAIN` at the VM's public IP first (a free [DuckDNS](https://www.duckdns.org) name works), and add
`https://<DOMAIN>/auth/callback` to Supabase's redirect URLs. Update later with `bash deploy/update.sh`.

Serverless platforms such as Vercel are not a fit: the worker, the WebSocket server and the LaTeX compiler
all need a persistent process.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `dev:offline` | Development server, with or without Supabase |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript |
| `npm run eval:verdicts` | Scores a labelled set of real and fixture postings and checks the verdicts |
| `npm run probe:keys` | Checks each model key and prints its rate limits |
| `npm run probe:db` | Checks the database connection and applied migrations |
| `npm run try:resume` / `try:compile` | Tailor or compile a resume from the command line |

## Project layout

```
app/            pages, API routes, metadata, share images
components/     UI
lib/fetch/      posting fetchers (ATS APIs, structured data, HTML)
lib/verify/     company checks
lib/pipeline/   read, score, run queue, worker, tool generation
lib/writing/    answers, outreach, honesty checks
lib/resume/     LaTeX parsing, tailoring, compile and one-page fit
lib/llm/        model routing and free-tier capacity tracking
db/             schema and migrations
eval/           labelled postings for verdict evaluation
docs/           product plan and design guide
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

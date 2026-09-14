# Contributing to Verdict

Thanks for helping. A few things keep this project useful and cheap to run.

## Ground rules

- **Free tiers only.** No change should require a paid API, paid hosting or a credit card to run.
- **Honesty first.** Nothing may put a claim on a user's application that their resume does not show. Changes to prompts or writing tools must keep the checks in `lib/writing/honesty.ts` passing, and new generated text must go through them.
- **No scraping of sites that forbid it.** LinkedIn and X are handled by pasting text, not by fetching.
- **No legitimacy verdicts on companies.** Verification reports what was checked, never "scam" or "verified".

## Getting set up

```bash
npm install
cp .env.example .env   # GROQ_API_KEY and GEMINI_API_KEY are enough
npm run dev:offline
```

## Before opening a pull request

```bash
npm run typecheck
npm test
```

If you change reading, scoring or verdict rules, also run `npm run eval:verdicts` and include the result in the pull request.

## Reporting bugs

Open an issue with the job link or posting text (remove anything personal), what verdict you expected, and what you got. Please never paste your resume or API keys into an issue.

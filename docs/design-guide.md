# Figma Design Guide — Job Application Agent

A screen-by-screen build guide. Written to be worked through top to bottom.

---

## 0. What you are designing

A hosted product where someone pastes a job link and gets an honest verdict first.
If the verdict says apply, three more tools unlock: a tailored resume, application
answers, and outreach messages.

```
link / screenshot / pasted text
        │
        ▼
     FETCH ──► VERIFY ──► SCORE ──► verdict
                  │                    │
           trust signal        skip / borderline ──► gaps + reasons, stop
        (shown either way)             │
                                    apply
                                       ▼
                      ┌────────────────┼────────────────┐
                   RESUME          ANSWERS          OUTREACH
```

**The gating is the product.** Most of your design effort should go into the verdict
screen and the locked state of the three tools below it. That is the thing nobody else
does, and it is the thing a user will screenshot and send to a friend.

**Design principle for the whole product:** this is a tool that tells people
uncomfortable truths. It should look calm, precise and slightly clinical. Not playful,
not hypey, no gradients-and-sparkles AI aesthetic. Think Linear or Stripe, not a
landing page for a chatbot.

---

## 1. File setup, and the free-tier constraints that shape it

Figma's free Starter plan (verify current limits in-app, Figma changes these):

| Limit | Consequence for you |
|---|---|
| 3 collaborative design files, unlimited personal drafts | Keep the **entire product in ONE file**. Do not split screens across files |
| **No team libraries** (publishing components across files) | Components only work inside the file they live in. This is the real reason for one file |
| Variable **modes** are restricted | Do not plan a light/dark toggle via variable modes. Design light-first; if you want dark, make a duplicate page later |
| Version history limited to 30 days | Name your versions manually at milestones (`Ctrl+Alt+S`) |
| Dev Mode is limited | Your handoff notes matter more. Write measurements into the file as annotations |

### Page structure

Create one file called `Job Agent — Product`. Inside it, these pages:

```
📕  00 Cover
🎨  01 Foundations
🧩  02 Components
🗺️  03 Flows
🖥️  04 Screens — Desktop
📱  05 Screens — Mobile
🧪  06 States & Edge Cases
🗑️  99 Archive
```

**Never delete anything.** Move it to Archive. You will want a discarded idea back.

### Naming convention

Frames: `04.3 Verdict — Apply`, `04.3a Verdict — Borderline`, `04.3b Verdict — Skip`.
Numbering makes the layer panel sortable and makes conversations unambiguous.

Components: `Button / Primary / Medium`, `Badge / Verdict / Apply`. The slashes create
folders in the assets panel automatically.

---

## 2. Foundations page

Build this page first, completely, before you draw a single screen. Every hour here
saves three later.

### 2.1 Frames and grid

| Breakpoint | Frame size | Columns | Margin | Gutter |
|---|---|---|---|---|
| Desktop | 1440 × 1024 | 12 | 80 | 24 |
| Tablet | 768 × 1024 | 8 | 32 | 20 |
| Mobile | 375 × 812 | 4 | 20 | 16 |

Max content width on desktop: **1120px**, centred. Full-bleed 1440 layouts look empty
and make text lines too long to read.

### 2.2 Colour

Neutral base, one accent, three semantic colours for the verdict. Create these as
**Color Styles** (right panel → Fill → the four-dot icon → +).

**Neutrals**
```
bg/base         #FFFFFF
bg/surface      #F8F8F9     cards, panels
bg/sunken       #F1F1F3     code blocks, inputs
border/default  #E4E4E7
border/strong   #D4D4D8
text/primary    #18181B
text/secondary  #52525B
text/muted      #A1A1AA
```

**Accent** — pick one and never introduce a second
```
accent/default  #4F46E5
accent/hover    #4338CA
accent/subtle   #EEF2FF     tinted backgrounds
accent/border   #C7D2FE
```

**Semantic — the verdict colours. These carry meaning, treat them as load-bearing**
```
apply/text      #15803D     apply/bg  #F0FDF4     apply/border  #BBF7D0
borderline/text #B45309     borderline/bg #FFFBEB borderline/border #FDE68A
skip/text       #B91C1C     skip/bg   #FEF2F2     skip/border   #FECACA
info/text       #0369A1     info/bg   #F0F9FF     info/border   #BAE6FD
```

**Rule: never communicate the verdict with colour alone.** Every verdict badge carries
an icon and a word as well. Roughly 1 in 12 men has some form of colour vision
deficiency, and red/green is the common one — which is exactly the pair you are using.
Check every verdict state in Figma's colourblind plugin before you call it done.

Check all text/background pairs at [webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker/).
Body text needs 4.5:1, large text 3:1.

If you want a more considered palette than the one above, steal from
[Radix Colors](https://www.radix-ui.com/colors) (designed in pairs for exactly this
kind of semantic use) or [Tailwind's palette](https://tailwindcss.com/docs/colors).

### 2.3 Type

**Inter** for everything, **JetBrains Mono** for code, scores and `.tex` content. Both
free on [Google Fonts](https://fonts.google.com).

```
Display    40 / 48   Semibold   -0.02em     landing hero only
H1         32 / 40   Semibold   -0.01em     page titles
H2         24 / 32   Semibold   -0.01em     section headers
H3         20 / 28   Semibold                card titles
Body L     18 / 28   Regular                 lead paragraphs
Body       16 / 24   Regular                 default
Body S     14 / 20   Regular                 secondary info, table cells
Caption    12 / 16   Medium     0.01em       labels, meta
Mono       14 / 20   Regular                 scores, .tex, code
```

Create every one as a **Text Style**. Play with the ratio at
[typescale.com](https://typescale.com) if you want to tune it.

### 2.4 Spacing

4pt base, 8pt rhythm. Only use these numbers:

```
4  8  12  16  24  32  48  64  96  128
```

If you find yourself typing 18 or 30, you are guessing. Round to the scale.

### 2.5 Radius and elevation

```
radius/sm    6px     badges, chips, inputs
radius/md    10px    buttons, cards
radius/lg    14px    modals, large panels
radius/full  999px   avatars, pills
```

Keep it flat. Two shadows only:
```
shadow/sm    0 1px 2px rgba(16,24,40,0.05)
shadow/lg    0 12px 32px rgba(16,24,40,0.12)     modals and popovers only
```

### 2.6 Icons

[Lucide](https://lucide.dev/icons/) — free, open source, has a Figma plugin, and
matches the clinical tone. Install the plugin, use 20px icons at 1.5px stroke as your
default. Do not mix icon sets.

---

## 3. Components page

Build these as components with variants before drawing screens. Auto Layout on
everything.

### Priority 1 — you cannot draw a screen without these

**Button**
- Variants: `Primary`, `Secondary`, `Ghost`, `Danger`
- States: `Default`, `Hover`, `Pressed`, `Disabled`, `Loading`
- Sizes: `sm` (32h), `md` (40h), `lg` (48h)
- Anatomy: icon-left slot, label, icon-right slot. Padding 16/12/20 by size.
- Loading state shows a spinner and keeps the button's width fixed — a button that
  shrinks when clicked is a jarring bug you can prevent in the design.

**Input**
- States: `Default`, `Focus`, `Filled`, `Error`, `Disabled`
- Anatomy: label above, field, helper text below, error text replaces helper
- Focus = 2px accent ring offset 2px. Do not remove focus rings; keyboard users need them.

**Textarea** — same states. Used heavily for the paste fallback and custom questions,
so give it a generous default height (160px) and a resize affordance.

**Card** — `bg/surface`, `border/default` 1px, `radius/md`, padding 24.

### Priority 2 — the product's signature components

**Verdict Badge** — the single most important component in the file.
- Variants: `Apply`, `Borderline`, `Skip`
- Anatomy: icon + label + optional score. Icon differs per variant (check / alert-triangle
  / x-circle), not just colour.
- Sizes: `sm` for history rows, `lg` for the verdict screen

**Score Ring** — 0–100 circular gauge.
- 120px diameter on the verdict screen, 6px stroke
- Number in Mono 32, label "match" in Caption below
- Ring colour follows the verdict band, track is `border/default`
- Design the 0, 47, 68, 92 and 100 states so you know it reads at every fill

**Gap Chip** — one missing requirement.
- `bg/sunken`, `radius/full`, 12px horizontal padding, Body S
- Variant `Blocking` uses skip colours, for hard disqualifiers
- These are the most useful thing on the verdict screen. Make them scannable.

**Stage Indicator** — the live progress from the WebSocket.
- States per stage: `Pending` (muted, hollow circle), `Running` (accent, spinner),
  `Done` (green, check), `Failed` (red, x)
- Horizontal on desktop, vertical on mobile
- Five stages: Fetch → Verify → Read → Score → Verdict
- Design the failed state properly. It will happen often.

**Locked Tool Card** — the gating made visible.
- States: `Locked`, `Unlockable`, `Unlocked`, `Generating`, `Ready`
- Locked state is not just greyed out. It says *why*: "Unlocks if the verdict is Apply."
- Unlockable (borderline) has a secondary button: "Generate anyway"
- This component is where the product's opinion lives. Spend real time on it.

**Check Row** — one verification result.
- Variants: `Confirmed` (check, muted green), `Not confirmed` (dash, neutral grey),
  `Flag` (alert, amber)
- Anatomy: status icon, label, detail text on a second line
- **Design the neutral state carefully.** Most checks land on "could not confirm", and that
  must read as neutral information rather than as suspicion. If your grey looks like a
  failure, the component is wrong.

**Company Type Pill** — `Product`, `Services`, `Staffing`, `EOR`, `Unknown`.
- Neutral styling for all five. None of them is bad news, they are different kinds of job
- `Staffing` and `EOR` get an info icon that opens a one-line explanation of what it means
  for the applicant

**Hard Stop Banner** — the one place the product does take a position.
- Full-width, skip colours, alert icon
- Used only for fee requests or demands for documents before an offer
- Should look unlike anything else in the product, because it means stop

### Priority 3

**Tabs**, **Modal** (with backdrop `rgba(9,9,11,0.4)`), **Toast** (4 variants),
**Empty State** (icon + title + one line + one action), **Copy Button** (idle →
copied checkmark for 2s), **Avatar / Account Menu**, **Diff View** (added lines
`apply/bg`, removed `skip/bg` with strikethrough, mono 14).

---

## 4. Flows page

Before screens, map these four journeys as boxes and arrows. Fifteen minutes each,
low fidelity, no styling. You are finding missing screens, not designing.

1. **First run:** land → sign in → upload resume → add links → upload master .tex →
   confirm what we understood → paste first link → verdict
2. **Returning:** dashboard → paste → progress → verdict → unlock resume → download
3. **Fetch blocked:** paste link → tier 1-3 fail → "we could not read this page" →
   paste JD text → continue as normal
4. **Quota hit:** unlock attempt → quota exceeded → add your own API key → retry

Flow 3 matters more than it looks. Cloudflare will block your fetcher regularly, so
the paste fallback is a **normal path, not an error**. Design it that way — no red, no
apology, just "paste the description and we will carry on."

---

## 5. Screens

Marked **[MVP]** for the first pass and **[Later]** for the rest. Build every MVP
screen at desktop first, then do mobile.

---

### 5.1 Landing **[MVP]**

**Purpose:** convince a stranger in 8 seconds, then get them to paste a link.

**Layout:** single column, 1120 max width, generous vertical rhythm (96–128 between
sections).

**Sections:**
1. **Hero.** Headline stating the honest promise, not the feature. Something in the
   territory of *"Find out if a job is worth applying to, before you spend an hour on
   it."* Sub-line explaining the verdict in one sentence. Then **the paste box, right
   there in the hero** — not a "Get started" button. Let them try it immediately.
2. **The verdict, shown.** A real screenshot of a Skip verdict with its gaps. Showing
   the product refusing to do work is the most persuasive thing on the page.
3. **Three tools**, presented as what unlocks after a positive verdict.
4. **Honesty section.** "We never put a skill on your resume that you do not have."
   State the machine checks. This is your differentiator, give it real estate.
5. **Footer.** Minimal.

**States:** default, paste box focused, paste box with an invalid URL.

**Mistake to avoid:** do not write "AI-powered" anywhere. Every competitor says it, it
is now noise, and it undercuts the clinical tone.

---

### 5.2 Sign in **[MVP]**

**Purpose:** get out of the way.

Anonymous-first, so this screen is genuinely optional at the start. Centred card,
400px, logo, one line of explanation, Google button, and a "continue without an
account" link that is visually quieter but not hidden.

**States:** default, loading, error.

---

### 5.3 Onboarding **[MVP]** — four steps

Use a stepper at the top: `1 Resume → 2 Links → 3 Master file → 4 Confirm`. Show
progress. Let people go back.

**5.3a Resume upload.** Dropzone as the hero element. States: idle, drag-over,
uploading with progress, success with filename and parsed preview, error. The error
state needs a specific message for a scanned or image-only PDF, because that fails
silently otherwise and the user will not know why.

**5.3b Links.** Three inputs: GitHub, LinkedIn, portfolio. All optional, say so.
Show inline validation on blur, not on every keystroke.

**5.3c Master resume file.** Upload the `.tex`. This one needs explanation, because
most users will not have one. Offer three paths: upload your own, start from a
template, or skip and we generate plain text. Design all three entry points.

**5.3d Confirm what we understood.** The most important onboarding screen. Show the
parsed profile back: name, seniority, years, skills as chips, projects, experience.
Every field editable inline. A prominent "this is wrong, let me fix it" affordance.

Getting this wrong poisons every verdict afterwards, so the screen should feel like a
checkpoint, not a formality.

---

### 5.4 Dashboard **[MVP]**

**Purpose:** paste a new link, see past runs.

**Layout:** sidebar (nav + account) + main column.

**Main column top:** the paste box, always the first thing. Large, focused by default.
Placeholder shows a real example URL.

It accepts three kinds of input and the design has to make that obvious without clutter:
a **URL**, **pasted text**, or a **dropped screenshot**. A lot of job posts only exist as
images on X and LinkedIn, so image is a first-class input, not an afterthought. Design the
drag-over state for the whole box, and an extracted-text confirmation step after an image
is read, since an OCR error in a required skill or a salary figure is worse than no
reading at all.

**Below:** run history as a table or card list. Each row: company, role, verdict badge,
score, date, and a link back to the run. Sortable by verdict and date. Filter chips
for Apply / Borderline / Skip.

**States:** empty (first-time, with a sample link to try), populated, loading skeleton.

The empty state matters. A brand-new user has nothing here, and "no runs yet" is a
wasted screen. Put a real example job link they can click to see the product work.

---

### 5.5 Run in progress **[MVP]**

**Purpose:** show live work, make 30 seconds feel short.

Stage Indicator across the top with the five stages: Fetch, Verify, Read, Score, Verdict. Below it, a live log line per
stage as the socket pushes events: *"Found this on Lever"*, *"Reading 1,240 words"*,
*"Scoring against your profile"*.

Show the job title and company as soon as fetch resolves, so there is something real
on screen early.

**States:** each stage running, each stage failed, all done.

**Design note:** do not use a fake indeterminate progress bar. You have real stage
events over the WebSocket. Use them. A truthful five-step indicator builds more trust
than a smooth fake bar.

---

### 5.6 Fetch failed → paste fallback **[MVP]**

**Purpose:** recover without shame.

Calm, not red. Informational icon, not a warning triangle. Copy along the lines of
*"This page is behind a login or bot check, so we could not read it automatically.
Paste the job description and we will carry on."*

Big textarea, a Continue button, and a small note that everything else works the same
from here.

**Variants to design:** login wall, bot check, unsupported site, and LinkedIn
specifically — which should say plainly that you do not fetch LinkedIn, rather than
pretending it failed.

---

### 5.6b Trust panel **[MVP]**

**Purpose:** say what was checked about the company, and what could not be.

This is not a separate page. It is a panel that sits on the verdict screen, above the
tool cards, and it renders for every job regardless of verdict.

**Anatomy:**
- Company Type Pill and the company name as the header
- A short list of Check Rows: domain, mail records, careers page, contact address, stated
  office
- When the type is `Staffing` or `EOR`, a one-line explanation of what that means for the
  applicant, because it is the most useful thing on the panel
- "Questions worth asking" as a short list the user can copy

**Collapsed by default**, showing a one-line summary and a count. Expanded when something
is flagged. The verdict is the headline; this is supporting evidence.

**States to design:** all confirmed, mixed, mostly unconfirmed, hard stop.

**The design constraint that matters most here:** there is no verified badge and no trust
score. No green tick, no percentage, no shield icon. Those manufacture a confidence the
underlying checks cannot support, and a false "verified" on a fraudulent posting is the
single worst thing this product could do to someone. The panel states facts and stops.

Equally, "not confirmed" must look neutral rather than accusatory. Most legitimate roles
are absent from their company's careers page because social posts outrun websites. If your
grey dash reads as an accusation, real companies get smeared by your colour choices.

**Hard stop is the one exception.** If the posting asks for money or documents before an
offer, the Hard Stop Banner takes over the top of the screen and the tool cards stay
locked regardless of score.

---

### 5.7 Verdict **[MVP]** — three screens

This is the product. Design all three fully.

**Shared layout:**
- Job header: role, company, location, employment type, salary if found, source badge,
  link out to the original
- Score Ring, large, left or centre
- Verdict Badge, large, beside the ring
- **Rationale** — two sentences naming a concrete overlap. Body L.
- **Gaps** — chips, most blocking first
- **What you lead with** — the strongest matching experience or project
- The three tool cards below

**5.7a Apply.** Tool cards unlocked and inviting. The rationale should name the
specific overlap that earned the score.

**5.7b Borderline.** Same, but tool cards are `Unlockable` with a "generate anyway"
secondary action, and the gaps section is more prominent. Add a line about what would
move it to Apply.

**5.7c Skip.** Tool cards `Locked` with the reason stated. Gaps are the hero of the
screen. If a hard disqualifier fired (a must-have language the profile lacks), call it
out above the gaps in its own callout.

The Skip screen should feel like a favour, not a rejection. The user just saved an
hour. Consider a quiet line acknowledging that: *"Not a fit. That is an hour back."*

---

### 5.8 Tailored resume **[MVP]**

**Purpose:** show what changed, and why, then hand over files.

**Layout:** two panes. Left is the diff (before/after bullets). Right is a summary:
what was foregrounded, which blocks were included or dropped, which employer keywords
were matched.

**Top bar:** page count indicator (`1 page` green / `2 pages` amber), download `.tex`,
download `.pdf`, regenerate.

**States:** generating (with the auto-fit attempt counter, "fitting to one page,
attempt 2 of 3"), ready, overflow warning, validation failed.

**The validation-failed state is important.** When the honesty checker catches an
invented term, show it: *"We dropped 'Kubernetes' — it is not in your profile."*
That is the product working, not an error. Design it as a positive.

---

### 5.9 Application answers **[MVP]**

**Purpose:** produce paste-ready answers.

Accordion or stacked cards, one per question. Each has the question, the generated
answer in an editable textarea, a character count if the form has a limit, and a copy
button.

Above them: an "Add a question from the form" input, so pasted custom questions
(Google Forms, Ashby, Tally) go here. Design the empty and populated states of that.

**States:** generating, ready, edited-by-user, regenerating one answer.

---

### 5.10 Outreach **[Later]**

Three tabs: LinkedIn, X, Email. Each shows the message, a live character counter
against its limit (LinkedIn 300), and a copy button. Email has subject and body.

Above: a contact field, since this only makes sense when there is a named person.

---

### 5.11 Settings **[Later]**

Three tabs:
- **Profile** — everything from onboarding, editable, plus re-upload resume
- **API keys** — bring your own key per provider. Show only the last four characters
  of a saved key, never the whole thing. Add, replace, delete.
- **Usage** — today's counts against limits, per action, with a clear note that
  bringing your own key stops the counting

---

### 5.12 States and edge cases page **[MVP for the first four]**

Do not skip these. They are most of the real experience.

- Quota exceeded, with the BYOK path offered
- Generation failed after 3 attempts, with the problems listed
- Empty run history
- Offline / socket disconnected, with a note that the run continues server-side
- Session expired
- 404

---

## 6. Reference links

All verified reachable.

**Study these products** — closest in tone to what you are building:
- [Linear](https://linear.app) — the reference for calm, dense, precise product UI
- [ui.shadcn.com](https://ui.shadcn.com) — component anatomy and states, and you can
  read the actual implementations later
- [Untitled UI](https://www.untitledui.com) — the free tier is a solid Figma foundation
  if you want a head start on components

**Patterns and inspiration:**
- [Mobbin](https://mobbin.com) — real app screens by flow. Best single resource for
  "how do people usually do onboarding"
- [Godly](https://godly.website) — for the landing page only

**Craft:**
- [Refactoring UI](https://www.refactoringui.com) — if you read one thing about visual
  design, read this. It is written for developers and it is mostly about spacing,
  hierarchy and colour, which is where most designs fail
- [Type Scale](https://typescale.com)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Radix Colors](https://www.radix-ui.com/colors) / [Tailwind Colors](https://tailwindcss.com/docs/colors)
- [Lucide Icons](https://lucide.dev/icons/)
- [Google Fonts](https://fonts.google.com)

**Figma Community** — browse at [figma.com/community](https://www.figma.com/community).
I cannot link specific files because Figma blocks automated access and a wrong file ID
is worse than none, so search these terms in the app:

| Search for | Why |
|---|---|
| `Untitled UI` | Large free component library, good structure to learn from |
| `Material 3 Design Kit` | Official Google kit, excellent variant modelling |
| `Wireframe kit` | For the low-fidelity flow pass |
| `Dashboard UI kit` | Table, sidebar and empty-state patterns |
| `Figma colorblind` (plugins) | Test your verdict colours |
| `Unsplash` or `Content Reel` (plugins) | Placeholder content that is not lorem ipsum |

---

## 7. Suggested order of work

| # | Task | Rough time |
|---|---|---|
| 1 | File, pages, naming | 30 min |
| 2 | Foundations: grid, colour, type, spacing, radius | 2–3 h |
| 3 | Priority 1 components | 2–3 h |
| 4 | Flows on the Flows page, low fidelity | 1–2 h |
| 5 | Verdict screens, all three | 4–5 h |
| 5b | Trust panel and its four states | 2 h |
| 6 | Priority 2 components, refined from what the verdict screens needed | 2–3 h |
| 7 | Dashboard, Run in progress, Fetch fallback | 3–4 h |
| 8 | Onboarding, four steps | 3–4 h |
| 9 | Resume + Answers | 3–4 h |
| 10 | Edge cases and empty states | 2 h |
| 11 | Landing | 3–4 h |
| 12 | Mobile pass on MVP screens | 4–5 h |

**Design the verdict screens before the landing page.** The landing page needs a
screenshot of the verdict to be persuasive, and you cannot write honest marketing copy
for a product you have not designed yet.

---

## 8. Checklist before you call it done

- [ ] Every colour, type size and spacing value comes from a named style. No loose hex codes
- [ ] Every screen has hover, focus, loading, empty and error states designed
- [ ] Every verdict state is distinguishable with colour vision deficiency simulated
- [ ] All text passes 4.5:1 contrast, large text 3:1
- [ ] Every interactive element has a visible focus ring
- [ ] Nothing depends on a hover state alone, since touch devices have none
- [ ] Every screen exists at 1440 and 375
- [ ] No lorem ipsum anywhere. Use real job titles, real company names, real gaps
- [ ] The Skip verdict looks as considered as the Apply verdict
- [ ] The trust panel contains no verified badge, no trust score and no shield icon
- [ ] "Could not confirm" reads as neutral, not as an accusation
- [ ] The Hard Stop Banner looks unlike anything else in the product
- [ ] A stranger can understand what the product does from the verdict screen alone

That last one is the real test. If someone can open a screenshot of the verdict screen
with no other context and understand both what happened and why, the design is working.

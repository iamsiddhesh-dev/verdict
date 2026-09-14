import { ArrowRight, Check, CircleCheck, FileText, Info, Lock, MessageSquareText, Minus, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PasteBox } from "@/components/paste-box";
import { RequirementList } from "@/components/requirements";
import { Github, PublicPage } from "@/components/site-chrome";
import { GapChip, ScoreRing, VerdictBadge } from "@/components/verdict";
import { currentUser } from "@/lib/auth";
import { REPO_URL } from "@/lib/brand";
import { listRuns } from "@/lib/pipeline/runs";
import { loadProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

const SOURCES = ["Lever", "Greenhouse", "Ashby", "Workable", "Careers pages", "Text from LinkedIn and X"];

export default async function Landing() {
  const user = await currentUser();
  if (user && !user.local) redirect("/dashboard");
  if (user?.local) {
    const [profile, runs] = await Promise.all([loadProfile(user.id), listRuns(user.id, 1)]);
    if (profile || runs.length) redirect("/dashboard");
  }
  const signedIn = Boolean(user);

  return (
    <PublicPage signedIn={signedIn}>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
          aria-hidden
        />
        <div className="relative mx-auto grid w-full max-w-[1120px] items-center gap-12 px-5 pt-14 pb-16 md:px-10 md:pt-20 md:pb-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-base py-1 pr-3 pl-1 text-[13px] font-medium text-ink-2 shadow-[var(--shadow-sm)] hover:border-line-strong"
            >
              <span className="rounded-full bg-sunken px-2 py-0.5 text-[12px] text-ink">Free</span>
              Open source, no card, no paid APIs
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
            <h1 className="mt-6 text-[42px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[56px]">
              Is this job worth
              <br />
              applying to?
            </h1>
            <p className="mt-5 max-w-xl text-[18px] leading-7 text-ink-2">
              Paste a job link. Verdict reads the posting, checks the company and scores it against your real resume. You get apply, borderline or skip, with the
              reasons, in about a minute.
            </p>
            <div className="mt-8 max-w-xl">
              <PasteBox size="lg" signedIn={signedIn} />
            </div>
            <ul className="mt-5 flex max-w-xl flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted" aria-label="Works with">
              {SOURCES.map((s) => (
                <li key={s} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-apply" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-16 border-b border-line">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-16 md:px-10 md:py-24">
          <SectionHeading eyebrow="How it works" title="Three steps, and the first one happens once." />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { title: "Add your resume", body: "Upload a PDF, DOCX or your LaTeX file. You check what was understood before anything is judged against it." },
              { title: "Paste a job", body: "A link from an applicant tracking system or a careers page, or the text of a post from LinkedIn or X." },
              { title: "Read the verdict", body: "Every requirement is checked against your projects and experience. A missing core requirement means skip, whatever the rest says." },
            ].map((step, i) => (
              <li key={step.title} className="rounded-lg border border-line bg-base p-6">
                <span className="flex size-8 items-center justify-center rounded-full bg-ink font-mono text-[14px] font-medium text-white">{i + 1}</span>
                <p className="mt-5 text-[18px] leading-7 font-semibold text-ink">{step.title}</p>
                <p className="mt-2 text-[15px] leading-6 text-ink-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Skip */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-12 px-5 py-16 md:px-10 md:py-24 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Honest answers" title="A skip comes with the reason." />
            <p className="mt-5 max-w-lg text-[17px] leading-7 text-ink-2">
              When a role needs a language or framework your work does not show, it says so and names it. The writing tools stay locked, so the hour goes to a
              role that can go somewhere.
            </p>
          </div>
          <figure className="rounded-xl border border-line bg-base p-6 shadow-[var(--shadow-lg)] md:p-7" aria-label="Example of a skip verdict">
            <p className="text-[18px] leading-7 font-semibold text-ink">Backend Engineer, Payments</p>
            <p className="text-[14px] text-ink-2">Bengaluru · Onsite · Go, Kafka, PostgreSQL</p>
            <div className="mt-6 flex items-center gap-5">
              <ScoreRing score={41} verdict="skip" size={96} />
              <div className="space-y-2">
                <VerdictBadge verdict="skip" size="lg" />
                <p className="text-[14px] leading-5 text-ink-2">The role is Go services every day, and your projects are TypeScript and Python.</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <GapChip text="Requires Go, which is not in your profile." blocking />
              <GapChip text="Kafka" />
            </div>
            <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-[13px] text-muted">
              <Lock className="size-3.5" aria-hidden /> Answers, outreach and resume stay locked for this role.
            </div>
          </figure>
        </div>
      </section>

      {/* Company checks */}
      <section className="border-b border-line">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-12 px-5 py-16 md:px-10 md:py-24 lg:grid-cols-2">
          <figure className="order-2 rounded-xl border border-line bg-base p-6 shadow-[var(--shadow-lg)] lg:order-1" aria-label="Example company checks">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[16px] font-semibold text-ink">About the company</p>
              <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-[12px] font-medium text-ink-2">
                <Info className="size-3.5" aria-hidden /> Staffing
              </span>
            </div>
            <ul className="mt-4 divide-y divide-line text-[14px] leading-5">
              <li className="flex gap-3 py-3">
                <Check className="mt-0.5 size-4 shrink-0 text-apply" aria-hidden />
                <span className="text-ink">Domain and business email are set up</span>
              </li>
              <li className="flex gap-3 py-3">
                <Minus className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span className="text-ink">This role is not listed on their careers page</span>
              </li>
              <li className="flex gap-3 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-borderline" aria-hidden />
                <span className="text-ink">Applications go to a personal email address</span>
              </li>
            </ul>
            <p className="mt-3 rounded-md bg-info-bg px-3 py-2.5 text-[13px] leading-5 text-ink-2">
              Staffing firms usually hire for a client company, which decides the work and how long the role lasts.
            </p>
          </figure>
          <div className="order-1 lg:order-2">
            <SectionHeading eyebrow="Company checks" title="It looks at who is hiring, too." />
            <p className="mt-5 max-w-lg text-[17px] leading-7 text-ink-2">
              Domain and mail records, the careers page, the contact address, and what the company says it does. A posting that asks for a fee or documents
              before an offer is stopped outright.
            </p>
            <p className="mt-4 max-w-lg text-[15px] leading-6 text-muted">You see what was checked and what could not be. There is no trust score, because checks this light cannot support one.</p>
          </div>
        </div>
      </section>

      {/* Tools */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-16 md:px-10 md:py-24">
          <SectionHeading eyebrow="When it is a fit" title="Three tools unlock." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: MessageSquareText,
                title: "Application answers",
                body: "Why you and why them, plus any question pasted from the form, kept inside its character limit.",
              },
              { icon: Send, title: "Outreach", body: "A LinkedIn note, an X message and a cold email, each written for this company and this role." },
              {
                icon: FileText,
                title: "Tailored resume",
                body: "Your own LaTeX file with the most relevant work first, reworded in the posting's terms and fitted to one page as a PDF.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-line bg-base p-6">
                <span className="flex size-10 items-center justify-center rounded-md bg-sunken">
                  <Icon className="size-5 text-ink" aria-hidden />
                </span>
                <p className="mt-5 text-[18px] leading-7 font-semibold text-ink">{title}</p>
                <p className="mt-2 text-[15px] leading-6 text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honesty */}
      <section className="bg-ink text-white">
        <div className="mx-auto grid w-full max-w-[1120px] gap-10 px-5 py-16 md:px-10 md:py-24 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <ShieldCheck className="size-8 text-white" aria-hidden />
            <h2 className="mt-5 text-[32px] leading-10 font-semibold tracking-[-0.02em] md:text-[40px] md:leading-12">Nothing is claimed for you that your resume does not show.</h2>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              "Every skill and tool in a draft is checked against your resume. Anything that is not there is sent back and removed.",
              "Every number has to appear in your resume or in the posting.",
              "No comparisons with other candidates, no hype words and no volunteered weaknesses.",
              "A draft that still breaks a rule after three tries is shown with the problem, never passed off as clean.",
            ].map((rule) => (
              <li key={rule} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-5 text-[15px] leading-6 text-white/80">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-white" aria-hidden />
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final call to action */}
      <section>
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-start gap-6 px-5 py-16 md:flex-row md:items-center md:justify-between md:px-10 md:py-20">
          <div>
            <h2 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-ink md:text-[32px] md:leading-10">Check your next application first.</h2>
            <p className="mt-2 text-[16px] text-ink-2">Free to use. Free to run yourself.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={signedIn ? "/dashboard" : "/login"} className="inline-flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-[15px] font-medium text-white hover:bg-ink/85">
              Get started <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-base px-5 text-[15px] font-medium text-ink hover:bg-surface"
            >
              <Github className="size-4" /> Star on GitHub
            </a>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium tracking-[0.02em] text-muted uppercase">{eyebrow}</p>
      <h2 className="mt-3 max-w-2xl text-[32px] leading-10 font-semibold tracking-[-0.02em] text-ink md:text-[40px] md:leading-12">{title}</h2>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="relative" aria-label="Example verdict" role="figure">
      <div className="absolute -inset-4 -z-0 rounded-[28px] bg-gradient-to-b from-sunken to-transparent" aria-hidden />
      <div className="relative rounded-xl border border-line bg-base shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">Full-Stack Engineer</p>
            <p className="truncate text-[13px] text-muted">Bengaluru · Full-time · via Ashby</p>
          </div>
          <span className="rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-muted">42s</span>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-4">
            <ScoreRing score={84} verdict="apply" size={88} />
            <div className="space-y-2">
              <VerdictBadge verdict="apply" size="lg" />
              <p className="text-[13px] leading-5 text-ink-2">You have shipped the core of this role: a Next.js product with a PostgreSQL backend.</p>
            </div>
          </div>
          <div className="mt-5 rounded-md border border-line px-3 py-1.5">
            <RequirementList
              compact
              items={[
                { requirement: "React and TypeScript", kind: "must", met: "met" },
                { requirement: "PostgreSQL", kind: "must", met: "met" },
                { requirement: "Node.js APIs", kind: "must", met: "met" },
                { requirement: "Video processing", kind: "nice", met: "partial" },
              ]}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { icon: MessageSquareText, label: "Answers" },
              { icon: Send, label: "Outreach" },
              { icon: FileText, label: "Resume" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center justify-center gap-1.5 rounded-md border border-line bg-surface py-2 text-[12px] font-medium text-ink">
                <Icon className="size-3.5" aria-hidden /> {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

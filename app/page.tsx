import { FileText, Lock, MessageSquareText, Send, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { PasteBox } from "@/components/paste-box";
import { GapChip, ScoreRing, VerdictBadge } from "@/components/verdict";
import { currentUserId } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";
import { listRuns } from "@/lib/pipeline/runs";
import { loadProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const userId = await currentUserId();
  if (userId) {
    const [profile, runs] = await Promise.all([loadProfile(userId), listRuns(userId, 1)]);
    if (profile || runs.length) redirect("/dashboard");
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 md:px-10">
      <header className="flex h-16 items-center justify-between">
        <span className="text-[18px] font-semibold tracking-[-0.01em]">{PRODUCT_NAME}</span>
        <a href="/profile" className="text-[14px] font-medium text-ink-2 hover:text-ink">
          Set up profile
        </a>
      </header>

      <section className="py-16 md:py-24">
        <h1 className="max-w-3xl text-[40px] leading-12 font-semibold tracking-[-0.02em] text-ink md:text-[48px] md:leading-14">
          Find out if a job is worth applying to, before you spend an hour on it.
        </h1>
        <p className="mt-5 max-w-2xl text-[18px] leading-7 text-ink-2">
          Paste a job. It gets read, checked and scored against your real background, and you get a plain verdict: apply, borderline or skip, with the reasons.
        </p>
        <div className="mt-8 max-w-3xl">
          <PasteBox size="lg" />
        </div>
      </section>

      <section className="grid gap-10 border-t border-line py-16 md:grid-cols-2 md:py-24" aria-labelledby="skip-heading">
        <div>
          <h2 id="skip-heading" className="text-[32px] leading-10 font-semibold tracking-[-0.01em]">
            A skip comes with the reason.
          </h2>
          <p className="mt-4 text-[18px] leading-7 text-ink-2">
            One missing core requirement rules a role out, no matter how well the rest reads. You see exactly which one, and the writing tools stay locked so no
            time goes into an application that was not going anywhere.
          </p>
        </div>
        <figure className="rounded-lg border border-line bg-base p-6 shadow-[var(--shadow-sm)]" aria-label="Example verdict">
          <figcaption className="mb-4 text-[12px] font-medium tracking-[0.01em] text-muted uppercase">Example</figcaption>
          <p className="text-[18px] font-semibold text-ink">Backend Engineer, Payments</p>
          <p className="text-[14px] text-ink-2">Go, Kafka, PostgreSQL · Bengaluru · Onsite</p>
          <div className="mt-5 flex items-center gap-5">
            <ScoreRing score={41} verdict="skip" size={96} />
            <div className="space-y-2">
              <VerdictBadge verdict="skip" size="lg" />
              <p className="text-[14px] text-ink-2">The role is Go services every day, and the profile has no Go.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <GapChip text="Requires Go, which is not in the profile." blocking />
            <GapChip text="Kafka" />
            <GapChip text="3+ years in payments (partial)" />
          </div>
        </figure>
      </section>

      <section className="border-t border-line py-16 md:py-24" aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="text-[32px] leading-10 font-semibold tracking-[-0.01em]">
          When it is a fit, three tools unlock.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: MessageSquareText, title: "Application answers", body: "Why you, why them, and the questions pasted from the form, within their character limits." },
            { icon: Send, title: "Outreach", body: "A LinkedIn note, an X message and a cold email, each specific to this company." },
            { icon: FileText, title: "Tailored resume", body: "Your own LaTeX file, with the right blocks chosen and fitted to one page." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-md border border-line bg-surface p-6">
              <Icon className="size-5 text-accent" aria-hidden />
              <p className="mt-3 text-[18px] font-semibold">{title}</p>
              <p className="mt-1 text-[15px] leading-6 text-ink-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-16 md:py-24" aria-labelledby="honesty-heading">
        <div className="flex items-start gap-4">
          <ShieldCheck className="mt-1 size-7 shrink-0 text-ink" aria-hidden />
          <div>
            <h2 id="honesty-heading" className="text-[32px] leading-10 font-semibold tracking-[-0.01em]">
              Nothing is claimed for you that is not in your profile.
            </h2>
            <ul className="mt-6 grid gap-x-10 gap-y-3 text-[16px] leading-6 text-ink-2 md:grid-cols-2">
              <li>Every skill and tool in a draft is checked against your resume. Anything missing is sent back and removed.</li>
              <li>Every number has to appear in your profile or the posting.</li>
              <li>No comparisons with other candidates, no hype words, no volunteered weaknesses.</li>
              <li>A draft that still breaks a rule after three tries is shown with the problem, not passed off as clean.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-8 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden /> Nothing is ever sent or submitted for you.
        </span>
        <span>Runs on free tiers only.</span>
      </footer>
    </div>
  );
}

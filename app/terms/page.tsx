import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { PRODUCT_NAME, REPO_URL } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms", description: `The terms for using ${PRODUCT_NAME}.` };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="September 14, 2026">
      <section>
        <p>
          {PRODUCT_NAME} is a free tool that helps you decide whether to apply to a job and prepares application material from your own resume. By using it
          you agree to the terms below.
        </p>
      </section>

      <section>
        <h2>What it is, and what it is not</h2>
        <ul>
          <li>Verdicts, scores and company checks are an automated reading of the posting and your profile. They can be wrong. Treat them as input to your own decision.</li>
          <li>Company checks report what could and could not be confirmed. They are not a statement that a company or a job is genuine or fraudulent.</li>
          <li>Drafts and tailored resumes are suggestions. Read and edit them before you send anything. You are responsible for what you send.</li>
        </ul>
      </section>

      <section>
        <h2>Using it fairly</h2>
        <ul>
          <li>Use your own resume and information you have the right to use.</li>
          <li>Do not use it to misrepresent your experience, to automate mass applications, or to overload the service.</li>
          <li>It runs on free tiers of its providers, so usage may be limited or slowed at busy times.</li>
        </ul>
      </section>

      <section>
        <h2>The service</h2>
        <p>
          The hosted service is provided as is, without warranties, and may change, pause or stop. The source code is available under the MIT License on{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          , so you can also run it yourself.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          How your data is handled is described in the <Link href="/privacy">Privacy page</Link>. You can download or delete it at any time from your
          profile.
        </p>
      </section>
    </LegalPage>
  );
}

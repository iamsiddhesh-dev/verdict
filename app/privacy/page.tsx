import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { PRODUCT_NAME, REPO_URL } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy", description: `What ${PRODUCT_NAME} stores, where it goes, and how to delete it.` };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="September 14, 2026">
      <section>
        <p>
          {PRODUCT_NAME} exists to look at your resume next to a job posting. That means it handles personal information, so this page says plainly what is
          stored, where it goes, and how to remove it. The code is open source, so everything here can be checked against{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            the repository
          </a>
          .
        </p>
      </section>

      <section>
        <h2>What is stored</h2>
        <ul>
          <li>Your account: the email address, name and profile picture from Google, or the email you sign in with.</li>
          <li>Your profile: the resume file you upload, its text, what was extracted from it, your links, your notes on what you are looking for, and your LaTeX file if you add one.</li>
          <li>Every job you check: the link or text you pasted, the posting as it was read, the company checks, the score and the verdict.</li>
          <li>Everything written for you: answers, outreach messages and tailored resumes.</li>
        </ul>
      </section>

      <section>
        <h2>Where it goes</h2>
        <ul>
          <li>Data is stored in a PostgreSQL database hosted by Supabase.</li>
          <li>
            To read postings, score fit and write drafts, the relevant text (your profile and the posting) is sent to AI model providers: Groq and Google
            Gemini, and Mistral when configured. Their own terms apply to that processing. Free tiers of some providers allow them to use submitted content to
            improve their services, so do not put anything in your profile you would not want processed that way.
          </li>
          <li>To check a company, its public website, careers page, domain and mail records are looked up. Nothing about you is sent in those requests.</li>
          <li>Nothing is sold, shared with employers, or used for advertising. Nothing is ever sent or submitted on your behalf.</li>
        </ul>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>Only the cookies needed to keep you signed in. There are no analytics or advertising cookies.</p>
      </section>

      <section>
        <h2>Keeping and deleting your data</h2>
        <p>
          Your data is kept until you delete it. On your profile page, <strong>Download all my data</strong> gives you a copy of everything stored for your
          account, and <strong>Delete all my data</strong> permanently removes your profile, files, jobs and drafts.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For questions or requests about your data, open an issue on{" "}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            GitHub
          </a>
          . Please do not include personal details in a public issue; ask for a private contact instead.
        </p>
      </section>
    </LegalPage>
  );
}

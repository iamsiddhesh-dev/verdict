import { eq, sql } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { ResumeFacts } from "./resume";

export type { ResumeFacts } from "./resume";

export interface Profile {
  userId: string;
  resumeFilename: string | null;
  hasResumeFile: boolean;
  resumeText: string | null;
  facts: ResumeFacts | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  preferences: string | null;
  masterTex: string | null;
  confirmedAt: Date | null;
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  const db = await getDb();
  // Every column except the stored file, which only the download route reads.
  const [row] = await db
    .select({
      userId: profiles.userId,
      resumeFilename: profiles.resumeFilename,
      hasResumeFile: sql<boolean>`${profiles.resumeFile} IS NOT NULL`,
      resumeText: profiles.resumeText,
      facts: profiles.facts,
      githubUrl: profiles.githubUrl,
      linkedinUrl: profiles.linkedinUrl,
      portfolioUrl: profiles.portfolioUrl,
      preferences: profiles.preferences,
      masterTex: profiles.masterTex,
      confirmedAt: profiles.confirmedAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    userId: row.userId,
    resumeFilename: row.resumeFilename,
    hasResumeFile: Boolean(row.hasResumeFile),
    resumeText: row.resumeText,
    facts: (row.facts as ResumeFacts | null) ?? null,
    githubUrl: row.githubUrl,
    linkedinUrl: row.linkedinUrl,
    portfolioUrl: row.portfolioUrl,
    preferences: row.preferences,
    masterTex: row.masterTex,
    confirmedAt: row.confirmedAt,
  };
}

export function profileIsReady(p: Profile | null): p is Profile & { facts: ResumeFacts } {
  return Boolean(p?.facts && p.confirmedAt);
}

/** The candidate as a prompt block. Everything a judgment or a draft may cite comes from here. */
export function profileBlock(p: Profile & { facts: ResumeFacts }): string {
  const f = p.facts;
  const experience = f.experience.length
    ? f.experience
        .map((e) => `  - ${e.title} at ${e.company}${e.duration ? ` (${e.duration})` : ""}${e.location ? `, ${e.location}` : ""}: ${e.summary}`)
        .join("\n")
    : "  (none)";
  const projects = f.projects.length
    ? f.projects.map((pr) => `  - ${pr.name}: ${pr.description} (tech: ${pr.technologies.join(", ") || "n/a"})`).join("\n")
    : "  (none)";
  const education = f.education.map((e) => `  - ${e.degree}, ${e.institution}${e.graduationYear ? ` (${e.graduationYear})` : ""}`).join("\n");
  return [
    `Name: ${f.name ?? "unknown"}`,
    `Headline: ${f.headline ?? "none stated"}`,
    `Based in: ${f.location ?? "not specified"}`,
    `Years of professional software experience: ${f.yearsOfExperience}`,
    `Currently a student: ${f.isCurrentStudent ? "yes" : "no"}`,
    `Skills: ${f.skills.join(", ") || "n/a"}`,
    `Experience:\n${experience}`,
    `Projects:\n${projects}`,
    `Education:\n${education || "  (none)"}`,
    p.preferences?.trim() ? `The candidate's own notes on what they want (location, relocation, role type):\n${p.preferences.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Writes a sample resume in the built-in template, for warming Tectonic's
// package cache during the Docker build. Usage: warm-tectonic.ts <out.tex>

import { writeFileSync } from "node:fs";
import { masterTexFromFacts } from "@/lib/resume/template";

const out = process.argv[2] ?? "warm.tex";
writeFileSync(
  out,
  masterTexFromFacts({
    name: "Sample Person",
    email: "sample@example.com",
    phone: null,
    location: null,
    headline: null,
    seniority: null,
    isCurrentStudent: false,
    yearsOfExperience: 0,
    skills: ["TypeScript", "PostgreSQL"],
    projects: [{ name: "Sample", description: "Built a sample project with 100% test coverage.", technologies: ["TypeScript"], url: "https://example.com" }],
    experience: [{ company: "Example & Co", title: "Engineer", duration: "2025", location: "Remote", summary: "Shipped a feature." }],
    education: [{ institution: "University", degree: "B.E.", graduationYear: "2025" }],
    links: [],
  }),
);
console.log(`wrote ${out}`);

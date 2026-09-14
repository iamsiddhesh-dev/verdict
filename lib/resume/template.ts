// A master .tex for people who uploaded a PDF or DOCX instead of LaTeX.
//
// Built from the parsed resume facts in the same Jake Gutierrez template the
// parser understands, so both paths go through one tailoring pipeline. The facts
// are the resume's own wording, which keeps this honest: every bullet here is a
// sentence the person already wrote.
//
// Template: https://github.com/jakegut/resume (MIT).

import type { ResumeFacts } from "@/lib/profile";
import { escapeTex } from "./latex";

const PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\pdfgentounicode=1

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}
`;

const e = (s: string | null | undefined) => escapeTex((s ?? "").trim());

/** Split a summary into bullet-sized sentences without breaking "Node.js" or "0.64 MB". */
export function toBullets(text: string): string[] {
  return text
    .split(/(?<=[a-z0-9)%][.!?])\s+(?=[A-Z])|\n+|\s*•\s*|(?:^|\n)\s*[-*]\s+/)
    .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
    .filter((s) => s.length > 12);
}

function linkLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function masterTexFromFacts(facts: ResumeFacts, links: Array<string | null | undefined> = []): string {
  const allLinks = [...new Set([...links, ...facts.links].filter((l): l is string => Boolean(l && /^https?:\/\//.test(l))))];
  const contact = [
    facts.phone && e(facts.phone),
    facts.email && `\\href{mailto:${facts.email}}{\\underline{${e(facts.email)}}}`,
    ...allLinks.map((l) => `\\href{${l.replace(/[%#\\{}]/g, "")}}{\\underline{${e(linkLabel(l))}}}`),
  ].filter(Boolean);

  const parts = [
    PREAMBLE,
    `\\begin{center}\n    \\textbf{\\Huge \\scshape ${e(facts.name) || "Your Name"}} \\\\ \\vspace{1pt}\n    \\small ${contact.join(" $|$ ")}\n\\end{center}\n`,
  ];

  if (facts.education.length) {
    parts.push(
      `\\section{Education}\n  \\resumeSubHeadingListStart\n${facts.education
        .map((ed) => `    \\resumeSubheading\n      {${e(ed.institution)}}{}\n      {${e(ed.degree)}}{${e(ed.graduationYear)}}`)
        .join("\n")}\n  \\resumeSubHeadingListEnd\n`,
    );
  }

  if (facts.experience.length) {
    parts.push(
      `\\section{Experience}\n  \\resumeSubHeadingListStart\n${facts.experience
        .map((x) => {
          const bullets = toBullets(x.summary);
          const head = `    \\resumeSubheading\n      {${e(x.company)}}{${e(x.location)}}\n      {${e(x.title)}}{${e(x.duration)}}`;
          return bullets.length
            ? `${head}\n      \\resumeItemListStart\n${bullets.map((b) => `        \\resumeItem{${e(b)}}`).join("\n")}\n      \\resumeItemListEnd`
            : head;
        })
        .join("\n\n")}\n  \\resumeSubHeadingListEnd\n`,
    );
  }

  if (facts.projects.length) {
    parts.push(
      `\\section{Projects}\n  \\resumeSubHeadingListStart\n${facts.projects
        .map((pr) => {
          const name = pr.url ? `\\href{${pr.url.replace(/[%#\\{}]/g, "")}}{${e(pr.name)}}` : e(pr.name);
          const tech = pr.technologies.length ? ` $|$ \\emph{${e(pr.technologies.join(", "))}}` : "";
          const bullets = toBullets(pr.description);
          const head = `    \\resumeProjectHeading\n      {\\textbf{${name}}${tech}}{}`;
          return bullets.length
            ? `${head}\n      \\resumeItemListStart\n${bullets.map((b) => `        \\resumeItem{${e(b)}}`).join("\n")}\n      \\resumeItemListEnd`
            : head;
        })
        .join("\n\n")}\n  \\resumeSubHeadingListEnd\n`,
    );
  }

  if (facts.skills.length) {
    parts.push(
      `\\section{Technical Skills}\n \\begin{itemize}[leftmargin=0.15in, label={}]\n    \\small{\\item{\n     \\textbf{Skills}{: ${facts.skills.map(e).join(", ")}}\n    }}\n \\end{itemize}\n`,
    );
  }

  parts.push("\\end{document}\n");
  return parts.join("\n");
}

import { describe, expect, it } from "vitest";
import { escapeTex, isJakeTemplate, parseResumeTex, renderResumeTex, stripComments, texToPlain, unsafeTexReason, type Selection } from "./latex";
import { masterTexFromFacts, toBullets } from "./template";

const MASTER = String.raw`% Notes for a previous application
\documentclass[letterpaper,11pt]{article}
\input{glyphtounicode}
\newcommand{\resumeItem}[1]{\item\small{{#1 \vspace{-2pt}}}}
\newcommand{\resumeSubheading}[4]{\item #1 #2 #3 #4}
\newcommand{\resumeProjectHeading}[2]{\item #1 #2}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
\begin{document}
\begin{center}
  \textbf{\Huge \scshape Asha Rao} \\ \small +91 90000 00000
\end{center}

\section{Education}
  \resumeSubHeadingListStart
    \resumeSubheading{State University}{Pune, India}{B.E. Computer Engineering}{2021 -- 2025}
  \resumeSubHeadingListEnd

\section{Experience}
  \resumeSubHeadingListStart
    \resumeSubheading
      {Acme Corp}{Remote}
      {Software Engineer Intern}{Jan 2025 -- Jun 2025}
      \resumeItemListStart
        \resumeItem{Cut API latency by 40\% by caching \textbf{PostgreSQL} reads in Redis.}
        % \resumeItem{A commented bullet that must not appear.}
        \resumeItem{Built an admin dashboard in React \& TypeScript.}
      \resumeItemListEnd
  \resumeSubHeadingListEnd

\section{Projects}
    \resumeSubHeadingListStart
      \resumeProjectHeading
          {\textbf{\href{https://example.com}{Ledger}} $|$ \emph{Python, FastAPI}}{}
          \resumeItemListStart
            \resumeItem{Wrote an append-only ledger with 5,000 test payments.}
          \resumeItemListEnd
      \resumeProjectHeading
          {\textbf{Chat} $|$ \emph{Node.js}}{}
          \resumeItemListStart
            \resumeItem{Shipped a WebSocket chat for 20 users.}
            \resumeItem{Added rate limiting per connection.}
          \resumeItemListEnd
    \resumeSubHeadingListEnd

\section{Technical Skills}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
     \textbf{Languages}{: Python, TypeScript, SQL} \\
     \textbf{Tools}{: Docker, Git \& GitHub, Redis}
    }}
 \end{itemize}

\end{document}
`;

describe("texToPlain / escapeTex", () => {
  it("unwraps formatting and unescapes", () => {
    expect(texToPlain(String.raw`Cut latency by 40\% with \textbf{PostgreSQL} \& Redis`)).toBe("Cut latency by 40% with PostgreSQL & Redis");
    expect(texToPlain(String.raw`\textbf{\href{https://x.dev}{Ledger}} $|$ \emph{Python}`)).toBe("Ledger | Python");
  });
  it("escapes every LaTeX special character", () => {
    expect(escapeTex("50% & $5 #1 a_b {x} ~ ^ \\")).toBe(String.raw`50\% \& \$5 \#1 a\_b \{x\} \textasciitilde{} \textasciicircum{} \textbackslash{}`);
  });
  it("round-trips plain text through escape", () => {
    const s = "Saved 30% & $2k on C# builds_fast";
    expect(texToPlain(escapeTex(s))).toBe(s);
  });
  it("strips comments but keeps escaped percent signs", () => {
    expect(stripComments("a 40\\% b % note\n% whole line\nc")).toBe("a 40\\% b\nc");
  });
});

describe("parseResumeTex", () => {
  const parsed = parseResumeTex(MASTER);

  it("recognises the template", () => {
    expect(isJakeTemplate(MASTER)).toBe(true);
  });

  it("finds sections with the right kinds and editability", () => {
    expect(parsed.sections.map((s) => [s.name, s.kind, s.editable])).toEqual([
      ["Education", "education", false],
      ["Experience", "experience", true],
      ["Projects", "projects", true],
      ["Technical Skills", "skills", true],
    ]);
  });

  it("reads entries and bullets, ignoring commented ones", () => {
    const exp = parsed.sections[1].entries;
    expect(exp).toHaveLength(1);
    expect(exp[0].title).toBe("Acme Corp, Software Engineer Intern");
    expect(exp[0].bullets.map((b) => b.text)).toEqual(["Cut API latency by 40% by caching PostgreSQL reads in Redis.", "Built an admin dashboard in React & TypeScript."]);
    expect(parsed.sections[2].entries.map((e) => e.title)).toEqual(["Ledger", "Chat"]);
  });

  it("reads skills lines", () => {
    expect(parsed.sections[3].skills.map((l) => [l.label, l.items.map((i) => i.text)])).toEqual([
      ["Languages", ["Python", "TypeScript", "SQL"]],
      ["Tools", ["Docker", "Git & GitHub", "Redis"]],
    ]);
  });

  it("leaves a section with nested roles verbatim", () => {
    const nested = MASTER.replace("{Acme Corp}{Remote}", "{Acme Corp}{Remote}\n\\resumeSubSubheading{Intern}{2024}");
    const s = parseResumeTex(nested).sections[1];
    expect(s.editable).toBe(false);
  });
});

describe("renderResumeTex", () => {
  const parsed = parseResumeTex(MASTER);
  const [exp] = parsed.sections[1].entries;
  const [ledger, chat] = parsed.sections[2].entries;

  it("reorders, drops, rewrites and filters skills without touching the rest", () => {
    const selection: Selection = {
      entries: new Map([
        [1, [{ id: exp.id, bullets: [{ id: exp.bullets[1].id, text: null }, { id: exp.bullets[0].id, text: "Reduced API latency 40% with Redis caching & PostgreSQL" }] }]],
        [2, [{ id: chat.id, bullets: [{ id: chat.bullets[0].id, text: null }] }]],
      ]),
      skills: new Map([[3, new Map([["Languages", ["TypeScript", "Python"]], ["Tools", ["Git \\& GitHub"]]])]]),
    };
    const out = renderResumeTex(parsed, selection);

    expect(out).toContain("\\resumeSubheading{State University}"); // education verbatim
    expect(out.indexOf("admin dashboard")).toBeLessThan(out.indexOf("Reduced API latency"));
    expect(out).toContain("\\resumeItem{Reduced API latency 40\\% with Redis caching \\& PostgreSQL}");
    expect(out).not.toContain("Ledger");
    expect(out).not.toContain("rate limiting");
    expect(out).not.toContain("commented bullet");
    expect(out).not.toContain("Notes for a previous application");
    expect(out).toContain("\\textbf{Languages}{: TypeScript, Python}");
    expect(out).toContain("\\textbf{Tools}{: Git \\& GitHub}");
    expect(out.trim().endsWith("\\end{document}")).toBe(true);
    void ledger;
  });

  it("never emits an empty itemize", () => {
    const out = renderResumeTex(parsed, { entries: new Map([[2, [{ id: ledger.id, bullets: [] }]]]), skills: new Map() });
    expect(out).not.toMatch(/\\resumeItemListStart\s*\\resumeItemListEnd/);
  });

  it("keeps every bullet on an identity render", () => {
    const identity: Selection = { entries: new Map(), skills: new Map() };
    parsed.sections.forEach((s, i) => {
      if (s.entries.length) identity.entries.set(i, s.entries.map((e) => ({ id: e.id, bullets: e.bullets.map((b) => ({ id: b.id, text: null })) })));
    });
    const out = renderResumeTex(parsed, identity);
    expect([...out.matchAll(/\\resumeItem\{/g)]).toHaveLength(5);
  });
});

describe("unsafeTexReason", () => {
  it("allows the template's own glyphtounicode input", () => {
    expect(unsafeTexReason(MASTER)).toBeNull();
  });
  it.each([
    String.raw`\input{/app/.env}`,
    String.raw`\include{secrets}`,
    String.raw`\immediate\write18{ls}`,
    String.raw`\openin5=/etc/passwd`,
    String.raw`\csname input\endcsname`,
    String.raw`\usepackage{minted}`,
    String.raw`\catcode`,
  ])("rejects %s", (snippet) => {
    expect(unsafeTexReason(MASTER.replace("\\end{document}", `${snippet}\n\\end{document}`))).not.toBeNull();
  });
  it("ignores dangerous commands inside comments", () => {
    expect(unsafeTexReason(MASTER.replace("\\end{document}", "% \\input{/etc/passwd}\n\\end{document}"))).toBeNull();
  });
});

describe("masterTexFromFacts", () => {
  const facts = {
    name: "Asha Rao",
    email: "asha@example.com",
    phone: "+91 90000 00000",
    location: "Pune",
    headline: null,
    seniority: null,
    isCurrentStudent: false,
    yearsOfExperience: 0,
    skills: ["Python", "C#", "Node.js"],
    projects: [{ name: "Ledger", description: "Built an append-only ledger in Python. Ran 5,000 test payments through it.", technologies: ["Python"], url: "https://example.com/ledger" }],
    experience: [{ company: "Acme & Co", title: "Intern", duration: "2025", location: null, summary: "Cut API latency by 40% using Redis." }],
    education: [{ institution: "State University", degree: "B.E.", graduationYear: "2025" }],
    links: ["https://github.com/asha"],
  };

  it("produces a master the parser can edit, with everything escaped", () => {
    const tex = masterTexFromFacts(facts);
    const parsed = parseResumeTex(tex);
    expect(parsed.sections.map((s) => s.kind)).toEqual(["education", "experience", "projects", "skills"]);
    expect(parsed.sections[1].entries[0].bullets[0].text).toBe("Cut API latency by 40% using Redis.");
    expect(parsed.sections[2].entries[0].bullets).toHaveLength(2);
    expect(tex).toContain("Acme \\& Co");
    expect(tex).toContain("C\\#");
    expect(unsafeTexReason(tex)).toBeNull();
  });

  it("splits sentences without breaking Node.js or decimals", () => {
    expect(toBullets("Built a Node.js API serving 0.64 MB per search. Added caching.")).toEqual(["Built a Node.js API serving 0.64 MB per search.", "Added caching."]);
  });
});

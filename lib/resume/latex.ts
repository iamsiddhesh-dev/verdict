// Read a resume's LaTeX source into editable parts, and write it back.
//
// Only the parts tailoring may change are parsed: entries (a job or a project),
// their bullets, and the skills lines. Everything else (the preamble, the header,
// education, any section this parser does not fully understand) is carried
// through byte for byte. The rule is simple: if a section cannot be parsed with
// confidence, it is left exactly as the person wrote it.
//
// Supported: the Jake Gutierrez / sb2nov template and its many forks, which is
// what most people who have a .tex resume are using. It is recognised by its
// macros (\resumeSubheading, \resumeProjectHeading, \resumeItem).

export type SectionKind = "education" | "experience" | "projects" | "skills" | "other";

export interface TexBullet {
  id: string;
  /** The original LaTeX, used verbatim when the bullet is not rewritten. */
  tex: string;
  /** Plain text, for the model and for honesty checks. */
  text: string;
}

export interface TexEntry {
  id: string;
  macro: "resumeSubheading" | "resumeProjectHeading";
  /** Raw LaTeX arguments of the heading macro, carried through unchanged. */
  args: string[];
  title: string;
  subtitle: string;
  bullets: TexBullet[];
}

export interface SkillLine {
  label: string;
  /** Original items as LaTeX, so a kept item is never re-escaped. */
  items: Array<{ tex: string; text: string }>;
}

export interface TexSection {
  name: string;
  kind: SectionKind;
  /** The section exactly as written, from \section{...} up to the next one. */
  raw: string;
  /** False when the section is carried through verbatim. */
  editable: boolean;
  entries: TexEntry[];
  skills: SkillLine[];
}

export interface ParsedResume {
  preamble: string;
  heading: string;
  sections: TexSection[];
  ending: string;
}

// --- Plain text <-> LaTeX --------------------------------------------------------

export function texToPlain(tex: string): string {
  let s = tex;
  s = s.replace(/\\href\s*\{[^{}]*\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, "$1");
  // Unwrap formatting commands from the inside out until nothing changes.
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/\\(?:textbf|textit|emph|underline|small|footnotesize|scriptsize|large|Large|textsc|texttt|mbox)\s*\{([^{}]*)\}/g, "$1");
    if (next === s) break;
    s = next;
  }
  return s
    .replace(/\$\|\$/g, "|")
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/\\([%&$#_{}])/g, "$1")
    .replace(/\\textasciitilde(\{\})?/g, "~")
    .replace(/\\textasciicircum(\{\})?/g, "^")
    .replace(/\\textbackslash(\{\})?/g, "\\")
    .replace(/---/g, "\u2014")
    .replace(/--/g, "\u2013")
    .replace(/~/g, " ")
    .replace(/\\\\/g, " ")
    .replace(/\\vspace\s*\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeTex(text: string): string {
  return text
    .replace(/\\/g, "\u0000")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\u0000/g, "\\textbackslash{}")
    .replace(/\u2013/g, "--")
    .replace(/\u2014/g, "---");
}

// --- Scanning helpers --------------------------------------------------------------

/** Remove comments, keeping escaped percent signs. Comment-only lines disappear entirely. */
export function stripComments(tex: string): string {
  return tex
    .split("\n")
    .map((line) => {
      const m = line.match(/(^|[^\\])%/);
      if (!m || m.index === undefined) return line;
      const cut = line.slice(0, m.index + m[1].length);
      return cut.trim() === "" ? null : cut.replace(/\s+$/, "");
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Read one balanced {...} group starting at or after `from`, skipping whitespace. */
function readGroup(src: string, from: number): { content: string; end: number } | null {
  let i = from;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { content: src.slice(i + 1, j), end: j + 1 };
    }
  }
  return null;
}

function readArgs(src: string, from: number, count: number): { args: string[]; end: number } | null {
  const args: string[] = [];
  let pos = from;
  for (let n = 0; n < count; n++) {
    const g = readGroup(src, pos);
    if (!g) return null;
    args.push(g.content);
    pos = g.end;
  }
  return { args, end: pos };
}

function sectionKind(name: string): SectionKind {
  const n = name.toLowerCase();
  if (/skill|technolog|tools/.test(n)) return "skills";
  if (/project/.test(n)) return "projects";
  if (/experience|employment|work|internship/.test(n)) return "experience";
  if (/education|academic/.test(n)) return "education";
  return "other";
}

const HEADING_MACROS: Array<{ macro: TexEntry["macro"]; args: number }> = [
  { macro: "resumeSubheading", args: 4 },
  { macro: "resumeProjectHeading", args: 2 },
];

function splitItems(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of list) {
    if (c === "(" || c === "{") depth++;
    if (c === ")" || c === "}") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// --- Parse ------------------------------------------------------------------------

const SKILL_LINE_RX = /\\textbf\s*\{([^{}]*)\}\s*\{\s*:\s*((?:[^{}]|\{[^{}]*\})*)\}/g;

function parseEntries(body: string, sectionIndex: number): { entries: TexEntry[]; ok: boolean } {
  // Nested roles under one company need structure this renderer does not keep.
  if (/\\resumeSubSubheading\b/.test(body)) return { entries: [], ok: false };

  const found: Array<{ macro: TexEntry["macro"]; start: number; end: number; args: string[] }> = [];
  for (const { macro, args } of HEADING_MACROS) {
    const rx = new RegExp(`\\\\${macro}(?![a-zA-Z])`, "g");
    for (const m of body.matchAll(rx)) {
      const read = readArgs(body, (m.index ?? 0) + m[0].length, args);
      if (!read) return { entries: [], ok: false };
      found.push({ macro, start: m.index ?? 0, end: read.end, args: read.args });
    }
  }
  found.sort((a, b) => a.start - b.start);

  const itemCount = [...body.matchAll(/\\resumeItem(?![a-zA-Z])/g)].length;
  const entries: TexEntry[] = [];
  let bulletsSeen = 0;

  found.forEach((h, i) => {
    const regionEnd = i + 1 < found.length ? found[i + 1].start : body.length;
    const region = body.slice(h.end, regionEnd);
    const bullets: TexBullet[] = [];
    for (const m of region.matchAll(/\\resumeItem(?![a-zA-Z])/g)) {
      const g = readGroup(region, (m.index ?? 0) + m[0].length);
      if (!g) continue;
      bullets.push({ id: `s${sectionIndex}e${i}b${bullets.length}`, tex: g.content.trim(), text: texToPlain(g.content) });
    }
    bulletsSeen += bullets.length;

    const plainArgs = h.args.map(texToPlain);
    let title: string;
    let subtitle: string;
    if (h.macro === "resumeSubheading") {
      // #1 is the bold line (usually the organisation), #3 the italic one (usually the role).
      title = [plainArgs[0], plainArgs[2]].filter(Boolean).join(", ");
      subtitle = [plainArgs[3], plainArgs[1]].filter(Boolean).join(" | ");
    } else {
      const [name, ...rest] = plainArgs[0].split("|");
      title = name.trim();
      subtitle = rest.join("|").trim();
    }
    entries.push({ id: `s${sectionIndex}e${i}`, macro: h.macro, args: h.args, title, subtitle, bullets });
  });

  // Bullets outside any recognised entry would be lost on render.
  const firstHeading = found[0]?.start ?? body.length;
  const orphanBullets = /\\resumeItem(?![a-zA-Z])/.test(body.slice(0, firstHeading));
  return { entries, ok: found.length > 0 && bulletsSeen === itemCount && !orphanBullets };
}

function parseSkills(body: string): SkillLine[] {
  const lines: SkillLine[] = [];
  for (const m of body.matchAll(SKILL_LINE_RX)) {
    const items = splitItems(m[2]).map((tex) => ({ tex, text: texToPlain(tex) }));
    if (items.length) lines.push({ label: texToPlain(m[1]), items });
  }
  return lines;
}

export function isJakeTemplate(tex: string): boolean {
  return /\\resumeItem\b/.test(tex) && /\\resume(Sub|Project)[Hh]eading\b/.test(tex) && /\\begin\{document\}/.test(tex);
}

export function parseResumeTex(source: string): ParsedResume {
  const beginIdx = source.indexOf("\\begin{document}");
  const endIdx = source.lastIndexOf("\\end{document}");
  if (beginIdx < 0 || endIdx < beginIdx) throw new Error("The .tex file has no \\begin{document} ... \\end{document}.");

  const preamble = source.slice(0, beginIdx + "\\begin{document}".length);
  const body = stripComments(source.slice(beginIdx + "\\begin{document}".length, endIdx));
  const ending = source.slice(endIdx);

  const marks = [...body.matchAll(/\\section\*?\s*\{([^{}]*)\}/g)];
  const heading = body.slice(0, marks[0]?.index ?? body.length);
  const sections: TexSection[] = marks.map((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? body.length) : body.length;
    const raw = body.slice(start, end);
    const inner = raw.slice(m[0].length);
    const name = texToPlain(m[1]);
    const kind = sectionKind(name);

    if (kind === "experience" || kind === "projects") {
      const { entries, ok } = parseEntries(inner, i);
      return { name, kind, raw, editable: ok, entries: ok ? entries : [], skills: [] };
    }
    if (kind === "skills") {
      const skills = parseSkills(inner);
      return { name, kind, raw, editable: skills.length > 0, entries: [], skills };
    }
    return { name, kind, raw, editable: false, entries: [], skills: [] };
  });

  return { preamble, heading, sections, ending };
}

// --- Render -----------------------------------------------------------------------

export interface EntryChoice {
  id: string;
  /** Bullets in display order. `text` null keeps the original LaTeX. */
  bullets: Array<{ id: string; text: string | null }>;
}

export interface Selection {
  /** Entry order and content per section index. Sections absent here render verbatim. */
  entries: Map<number, EntryChoice[]>;
  /** Kept skill items per section index and line label, in order, as original LaTeX. */
  skills: Map<number, Map<string, string[]>>;
}

/** Preamble with the author's notes removed: they usually describe a different application. */
function cleanPreamble(preamble: string): string {
  return stripComments(preamble).replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "");
}

function hasListMacros(preamble: string): boolean {
  return /\\resumeSubHeadingListStart/.test(preamble) && /\\resumeItemListStart/.test(preamble);
}

function renderEntries(section: TexSection, choices: EntryChoice[], preamble: string): string {
  const byId = new Map(section.entries.map((e) => [e.id, e]));
  const listStart = hasListMacros(preamble) ? "\\resumeSubHeadingListStart" : "\\begin{itemize}[leftmargin=0.15in, label={}]";
  const listEnd = hasListMacros(preamble) ? "\\resumeSubHeadingListEnd" : "\\end{itemize}";
  const itemsStart = hasListMacros(preamble) ? "\\resumeItemListStart" : "\\begin{itemize}";
  const itemsEnd = hasListMacros(preamble) ? "\\resumeItemListEnd" : "\\end{itemize}";

  const blocks: string[] = [];
  for (const choice of choices) {
    const entry = byId.get(choice.id);
    if (!entry) continue;
    const bulletsById = new Map(entry.bullets.map((b) => [b.id, b]));
    const head = `    \\${entry.macro}\n      ${entry.args.map((a) => `{${a}}`).join("")}`;
    const bullets = choice.bullets
      .map((c) => {
        const original = bulletsById.get(c.id);
        if (!original) return null;
        return `        \\resumeItem{${c.text === null ? original.tex : escapeTex(c.text)}}`;
      })
      .filter(Boolean);
    // An empty itemize is a LaTeX error, so an entry with no bullets gets no list.
    blocks.push(bullets.length ? `${head}\n      ${itemsStart}\n${bullets.join("\n")}\n      ${itemsEnd}` : head);
  }
  if (!blocks.length) return "";
  return `\\section{${escapeTex(section.name)}}\n  ${listStart}\n\n${blocks.join("\n\n")}\n\n  ${listEnd}\n\n`;
}

function renderSkills(section: TexSection, kept: Map<string, string[]>): string {
  return section.raw.replace(SKILL_LINE_RX, (full, label: string, list: string) => {
    const items = kept.get(texToPlain(label));
    // Function replacers: LaTeX items can contain "$", which a replacement string would interpret.
    if (!items || !items.length) return full.replace(list, () => list.trim());
    return full.replace(list, () => items.join(", "));
  });
}

export function renderResumeTex(parsed: ParsedResume, selection: Selection): string {
  const parts = [cleanPreamble(parsed.preamble), "\n", parsed.heading.replace(/\n{3,}/g, "\n\n")];
  parsed.sections.forEach((section, i) => {
    if (section.editable && (section.kind === "experience" || section.kind === "projects") && selection.entries.has(i)) {
      parts.push(renderEntries(section, selection.entries.get(i)!, parsed.preamble));
    } else if (section.editable && section.kind === "skills" && selection.skills.has(i)) {
      parts.push(renderSkills(section, selection.skills.get(i)!));
    } else {
      parts.push(section.raw);
    }
  });
  parts.push(parsed.ending.trimEnd(), "\n");
  return parts.join("").replace(/\n{3,}/g, "\n\n");
}

/** What would be sent to a compiler, as text, for checks that must see every word. */
export function resumePlainText(parsed: ParsedResume): string {
  return [parsed.heading, ...parsed.sections.map((s) => s.raw)].map(texToPlain).join("\n");
}

// --- Safety -----------------------------------------------------------------------

// The compiler runs on our server, and the source comes from the user. These
// primitives can read files from the machine (\input{/app/.env}), write files or
// run programs, and none of them appear in a resume template. Tectonic's
// --untrusted mode already disables shell escape; this closes file access too.
const UNSAFE_TEX = [
  /\\(?:input|include|InputIfFileExists|lstinputlisting|verbatiminput|includegraphics)\s*(?:\[[^\]]*\])?\s*\{(?!glyphtounicode\})/,
  /\\(?:openin|openout|read|readline|write|immediate|write18|ShellEscape|directlua|luaexec|csname|catcode|endlinechar|scantokens|special|pdffiledump|pdffilesize|pdfshellescape)(?![a-zA-Z])/,
  /\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:shellesc|bashful|pythontex|minted|catchfile|verbatimbox)\b/,
];

export function unsafeTexReason(source: string): string | null {
  const body = stripComments(source);
  for (const rx of UNSAFE_TEX) {
    const m = body.match(rx);
    if (m) return `The file uses ${m[0].trim().slice(0, 40)}, which can read or write files on the server, so it cannot be compiled here.`;
  }
  return null;
}

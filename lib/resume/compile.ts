// LaTeX to PDF, locally and for free.
//
// Tectonic is the compiler of choice: one self-contained binary, it fetches only
// the packages a document uses and caches them, and it has an untrusted mode for
// compiling source that came from a user. A system pdflatex is used when that is
// what the machine has. With neither, the tool still returns the .tex, which
// compiles in Overleaf, and says so instead of failing.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDocumentProxy } from "unpdf";
import { unsafeTexReason } from "./latex";

export interface Compiler {
  kind: "tectonic" | "pdflatex";
  bin: string;
}

export type CompileResult =
  | { ok: true; pdf: Buffer; pages: number; compiler: Compiler["kind"] }
  | { ok: false; reason: "no_compiler" | "unsafe" | "error"; message: string; log?: string };

const COMPILE_TIMEOUT_MS = 180_000;

// The compiler gets no application secrets in its environment: only what it
// needs to find itself, its package cache and a temp directory.
function compilerEnv(cwd: string): Record<string, string> {
  const pass = ["PATH", "Path", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "TMPDIR", "XDG_CACHE_HOME", "SystemRoot", "TECTONIC_CACHE_DIR"];
  const env: Record<string, string> = {};
  for (const k of pass) if (process.env[k]) env[k] = process.env[k]!;
  env.HOME ??= cwd;
  // pdflatex: refuse to read or write outside the working directory.
  env.openin_any = "p";
  env.openout_any = "p";
  return env;
}

function run(bin: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        cwd,
        timeout: COMPILE_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: compilerEnv(cwd) as unknown as NodeJS.ProcessEnv,
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
        resolve({ code, output: `${stdout}\n${stderr}` });
      },
    );
  });
}

let found: Promise<Compiler | null> | null = null;

async function onPath(bin: string): Promise<boolean> {
  const probe = await run(bin, ["--version"], tmpdir());
  return probe.code === 0;
}

export function findCompiler(): Promise<Compiler | null> {
  if (!found) {
    found = (async () => {
      const explicit = process.env.TECTONIC_PATH?.trim();
      const local = path.join(process.cwd(), ".data", "bin", process.platform === "win32" ? "tectonic.exe" : "tectonic");
      for (const bin of [explicit, existsSync(local) ? local : null, "tectonic"]) {
        if (bin && (await onPath(bin))) return { kind: "tectonic" as const, bin };
      }
      if (await onPath("pdflatex")) return { kind: "pdflatex" as const, bin: "pdflatex" };
      return null;
    })();
  }
  return found;
}

/** The last useful lines of a TeX log: the error, not the package loading chatter. */
function tailOfLog(log: string): string {
  const lines = log.split(/\r?\n/).filter((l) => l.trim());
  const errAt = lines.findIndex((l) => /^!|error:/i.test(l));
  return (errAt >= 0 ? lines.slice(errAt, errAt + 8) : lines.slice(-8)).join("\n").slice(0, 1_500);
}

export async function compileTex(source: string): Promise<CompileResult> {
  const unsafe = unsafeTexReason(source);
  if (unsafe) return { ok: false, reason: "unsafe", message: unsafe };

  const compiler = await findCompiler();
  if (!compiler) {
    return { ok: false, reason: "no_compiler", message: "No LaTeX compiler is installed on this server, so the PDF was not built. The .tex compiles as it is in Overleaf." };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "resume-"));
  try {
    await writeFile(path.join(dir, "resume.tex"), source, "utf8");
    const args =
      compiler.kind === "tectonic"
        ? ["--untrusted", "--chatter", "minimal", "--outdir", dir, "resume.tex"]
        : ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "resume.tex"];
    const { code, output } = await run(compiler.bin, args, dir);
    const pdfPath = path.join(dir, "resume.pdf");
    if (code !== 0 || !existsSync(pdfPath)) {
      return { ok: false, reason: "error", message: "The LaTeX did not compile.", log: tailOfLog(output) };
    }
    const pdf = await readFile(pdfPath);
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    return { ok: true, pdf, pages: doc.numPages, compiler: compiler.kind };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

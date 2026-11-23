// Runs before `next build` on Vercel (the `vercel-build` script).
//
// Downloads the static Linux Tectonic binary into .data/bin and compiles the
// built-in resume template once with the cache pointed at .data/tectonic-cache,
// so the LaTeX packages a resume needs ship inside the function bundle.
// next.config.ts includes both paths in the API functions.
//
// Anywhere other than Vercel this does nothing; locally, Tectonic comes from
// PATH or .data/bin as before.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (process.env.VERCEL !== "1") {
  console.log("[prebuild] not on Vercel, skipping Tectonic bundle");
  process.exit(0);
}

const VERSION = "0.17.0";
const root = process.cwd();
const binDir = path.join(root, ".data", "bin");
const bin = path.join(binDir, "tectonic");
const cache = path.join(root, ".data", "tectonic-cache");

mkdirSync(binDir, { recursive: true });
if (!existsSync(bin)) {
  const url = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${VERSION}/tectonic-${VERSION}-x86_64-unknown-linux-musl.tar.gz`;
  console.log(`[prebuild] downloading ${url}`);
  execFileSync("sh", ["-c", `curl -fsSL "${url}" | tar -xz -C "${binDir}" tectonic`], { stdio: "inherit" });
  chmodSync(bin, 0o755);
}
execFileSync(bin, ["--version"], { stdio: "inherit" });

const work = mkdtempSync(path.join(tmpdir(), "warm-"));
try {
  const tex = path.join(work, "warm.tex");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/warm-tectonic.ts", tex], { stdio: "inherit" });
  // Same pdfTeX-only guard as forXeTeX() in lib/resume/compile.ts, which every
  // real compile applies; Tectonic runs XeTeX.
  const source = readFileSync(tex, "utf8")
    .replace(/^([ \t]*)\\input\s*\{glyphtounicode\}/gm, "$1\\ifdefined\\pdfgentounicode\\input{glyphtounicode}\\fi")
    .replace(/^([ \t]*)\\pdfgentounicode\s*=\s*1/gm, "$1\\ifdefined\\pdfgentounicode\\pdfgentounicode=1\\fi");
  writeFileSync(tex, source);
  execFileSync(bin, ["--untrusted", "--chatter", "minimal", "--outdir", work, tex], {
    stdio: "inherit",
    env: { ...process.env, XDG_CACHE_HOME: cache },
  });
  console.log("[prebuild] tectonic cache warmed");
} catch (err) {
  // A cold cache only makes the first resume per instance slower (packages are
  // downloaded at runtime), so it must never fail the deploy.
  console.warn("[prebuild] could not warm the tectonic cache, continuing:", err.message);
} finally {
  rmSync(work, { recursive: true, force: true });
}

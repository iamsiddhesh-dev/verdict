// Compile a .tex with the same code path the resume tool uses, and report pages.
//   npm run try:compile -- path/to/resume.tex

import { readFileSync, writeFileSync } from "node:fs";
import { compileTex, findCompiler } from "@/lib/resume/compile";

const file = process.argv[2];
if (!file) throw new Error("Pass a .tex path.");
console.log("compiler:", await findCompiler());
const started = Date.now();
const result = await compileTex(readFileSync(file, "utf8"));
if (result.ok) {
  const out = file.replace(/\.tex$/, ".pdf");
  writeFileSync(out, result.pdf);
  console.log(`ok: ${result.pages} page(s), ${result.pdf.length} bytes, ${Date.now() - started}ms -> ${out}`);
} else {
  console.log(`failed (${result.reason}): ${result.message}\n${result.log ?? ""}`);
}

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

// PRD 36: mapping route initial JS < 400 KB gzipped. Enforced in CI; raising
// the budget requires a written reason in the PR.

const BUDGET_BYTES = 400 * 1024;
const page = process.argv[2] ?? "out/projects/map.html";
const html = readFileSync(page, "utf8");

const chunkRe = /\/_next\/static\/[^"']+?\.js/g;
const urls = [...new Set(html.match(chunkRe) ?? [])];
const seen = new Set();
let total = 0;
const missing = [];
for (const url of urls) {
  const rel = url.replace(/^\/_next\/static\//, "");
  let path = null;
  for (const root of ["out/_next/static", ".next/static"]) {
    const candidate = join(root, rel);
    try {
      readFileSync(candidate);
      path = candidate;
      break;
    } catch {}
  }
  if (!path) {
    missing.push(url);
    continue;
  }
  if (seen.has(path)) continue;
  seen.add(path);
  total += gzipSync(readFileSync(path)).length;
}

const kb = (total / 1024).toFixed(0);
console.log(`Mapping route initial JS: ${kb} KB gz across ${seen.size} chunks (budget ${BUDGET_BYTES / 1024} KB)`);
if (missing.length) console.warn("Unresolved chunks:", missing);
if (total > BUDGET_BYTES) {
  console.error("BUDGET EXCEEDED");
  process.exit(1);
}

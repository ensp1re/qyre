#!/usr/bin/env node
/**
 * Validate README.md actually reflects the current product (F009) - not just that it exists.
 *
 * Checks for the specific things F009 requires: no leftover "skeleton" language, a working
 * quick-start, CI/npm/license badges, a screenshot/demo section, a "why not X" comparison, and the
 * read-only-enforced-by-the-database security story. Exits non-zero with a specific reason if any
 * are missing, so a future edit that regresses the README fails loudly instead of silently.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = resolve(here, "../README.md");

let content;
try {
  content = readFileSync(readmePath, "utf8");
} catch (error) {
  console.error(`Could not read README.md: ${error.message}`);
  process.exit(1);
}

const checks = [
  {
    name: "does not describe the project as an unimplemented skeleton",
    pass: !/early skeleton|not implemented yet/i.test(content)
  },
  {
    name: "has a working quick-start (npx humb ...)",
    pass: /```bash[\s\S]*?npx humb /.test(content)
  },
  {
    name: "has CI/npm/license badges (shields.io)",
    pass: (content.match(/img\.shields\.io/g) ?? []).length >= 3
  },
  {
    name: "has a screenshot or demo section",
    pass: /docs\/screenshots\//.test(content)
  },
  {
    name: 'has a "why not X" comparison section',
    pass: /##\s*why not/i.test(content)
  },
  {
    name: "tells the read-only-enforced-by-the-database security story",
    pass: /read.only/i.test(content) && /transaction|pragma|readonly:\s*true/i.test(content)
  }
];

const failed = checks.filter((check) => !check.pass);

if (failed.length > 0) {
  console.error("README.md is missing required content:\n");
  for (const check of failed) {
    console.error(`  - ${check.name}`);
  }
  process.exit(1);
}

console.log("README.md OK: reflects the current product per F009.");

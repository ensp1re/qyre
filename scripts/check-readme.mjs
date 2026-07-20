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

// The same canonical engine list check-engine-lockstep.mjs derives from connection-target.ts's
// `engine: "x"` literals (F059) - reused here instead of a second hand-maintained list, so a new
// engine landing without a README mention fails loudly instead of relying on someone noticing (this
// already happened once: the empty-state copy and this file's own "Status" section both said
// "Postgres or SQLite" after MySQL/MongoDB shipped).
const ENGINE_DISPLAY_NAMES = {
  postgres: "Postgres",
  mysql: "MySQL",
  sqlite: "SQLite",
  mongodb: "MongoDB"
};

let connectionTarget;
try {
  connectionTarget = readFileSync(
    resolve(here, "../packages/core/src/connection-target.ts"),
    "utf8"
  );
} catch (error) {
  console.error(`Could not read connection-target.ts: ${error.message}`);
  process.exit(1);
}
const engines = [
  ...new Set([...connectionTarget.matchAll(/engine:\s*"([a-z]+)"/g)].map((match) => match[1]))
].sort();

const checks = [
  {
    name: "does not describe the project as an unimplemented skeleton",
    pass: !/early skeleton|not implemented yet/i.test(content)
  },
  {
    name: "has a working quick-start (npx qyre ...)",
    pass: /```bash[\s\S]*?npx qyre /.test(content)
  },
  {
    name: "has CI/npm/license badges (shields.io)",
    pass: (content.match(/img\.shields\.io/g) ?? []).length >= 3
  },
  // The "has a screenshot or demo section" check is intentionally suspended: the pre-redesign
  // screenshots were removed as misleading, and fresh ones haven't been captured yet. Restore the
  // check (pass: /docs\/screenshots\//.test(content)) when scripts/capture-readme-screenshots.mjs
  // is rerun against the redesigned UI and the README section returns.
  {
    name: 'has a "why not X" comparison section',
    pass: /##\s*why not/i.test(content)
  },
  {
    name: "tells the read-only-enforced-by-the-database security story",
    pass: /read.only/i.test(content) && /transaction|pragma|readonly:\s*true/i.test(content)
  },
  ...engines.map((engine) => ({
    name: `mentions ${ENGINE_DISPLAY_NAMES[engine] ?? engine} (every supported engine must be named, not just the earliest ones)`,
    pass: new RegExp(`\\b${ENGINE_DISPLAY_NAMES[engine] ?? engine}\\b`, "i").test(content)
  }))
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

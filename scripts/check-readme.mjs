#!/usr/bin/env node
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

// Reuse the canonical engine list so README coverage stays in sync.
const ENGINE_DISPLAY_NAMES = {
  postgres: "Postgres",
  mysql: "MySQL",
  sqlite: "SQLite",
  mongodb: "MongoDB"
};

let connectionConstants;
try {
  connectionConstants = readFileSync(
    resolve(here, "../packages/core/src/constants/connection.ts"),
    "utf8"
  );
} catch (error) {
  console.error(`Could not read constants/connection.ts: ${error.message}`);
  process.exit(1);
}
const engines = [
  ...new Set(
    [...connectionConstants.matchAll(/^\s+\w+:\s*"([a-z]+)",?$/gm)].map((match) => match[1])
  )
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

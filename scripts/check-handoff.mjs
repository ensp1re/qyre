#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const handoffPath = resolve(here, "../docs/SESSION_HANDOFF.md");

const REQUIRED_SECTIONS = [
  "## Current state",
  "## Completed",
  "## In progress",
  "## Known issues / blockers",
  "## Next steps"
];

let content;
try {
  content = readFileSync(handoffPath, "utf8");
} catch (error) {
  console.error(`Could not read docs/SESSION_HANDOFF.md: ${error.message}`);
  process.exit(1);
}

const missing = REQUIRED_SECTIONS.filter((section) => !content.includes(section));

if (Buffer.byteLength(content) > 6500) {
  console.error("SESSION_HANDOFF.md exceeds the 6500-byte current-state budget.");
  process.exit(1);
}

if (missing.length > 0) {
  console.error("SESSION_HANDOFF.md is missing required sections:\n");
  for (const section of missing) {
    console.error(`  - ${section}`);
  }
  process.exit(1);
}

console.log("SESSION_HANDOFF.md OK: all required sections present.");

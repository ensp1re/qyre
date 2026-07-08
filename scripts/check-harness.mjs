#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const budgets = {
  "AGENTS.md": 7000,
  "docs/SESSION_HANDOFF.md": 6500,
  "docs/QUALITY_SCORE.md": 7000
};
const skills = ["qyre-design-system", "qyre-efficient-engineering", "qyre-lean-output"];

for (const [relativePath, maxBytes] of Object.entries(budgets)) {
  const bytes = statSync(resolve(root, relativePath)).size;
  if (bytes > maxBytes) errors.push(`${relativePath}: ${bytes} bytes exceeds ${maxBytes}.`);
}

if (existsSync(resolve(root, ".cursor")))
  errors.push(".cursor/: obsolete harness directory exists.");
if (readFileSync(resolve(root, ".gitignore"), "utf8").includes(".cursor/")) {
  errors.push(".gitignore: obsolete .cursor/ entry exists.");
}

for (const skill of skills) {
  const relativePath = `.agents/skills/${skill}/SKILL.md`;
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    errors.push(`${relativePath}: missing.`);
    continue;
  }
  const content = readFileSync(path, "utf8");
  if (!content.startsWith(`---\nname: ${skill}\ndescription:`)) {
    errors.push(`${relativePath}: invalid or mismatched frontmatter.`);
  }
  if (Buffer.byteLength(content) > 5000) errors.push(`${relativePath}: exceeds 5000-byte budget.`);
  if (!existsSync(resolve(root, `.agents/skills/${skill}/agents/openai.yaml`))) {
    errors.push(`.agents/skills/${skill}/agents/openai.yaml: missing.`);
  }

  const claudePath = resolve(root, `.claude/skills/${skill}/SKILL.md`);
  if (existsSync(claudePath) && readFileSync(claudePath, "utf8") !== content) {
    errors.push(`${relativePath}: differs from its Claude compatibility copy.`);
  }
}

const agents = readFileSync(resolve(root, "AGENTS.md"), "utf8");
for (const required of [
  "pnpm context",
  "pnpm verify:pr",
  "Cross-engine parity",
  "docs/CODE_ORGANIZATION.md",
  "Before starting a non-trivial change",
  "Never use `--no-verify`",
  "Omit praise, request restatement"
]) {
  if (!agents.includes(required))
    errors.push(`AGENTS.md: missing required contract "${required}".`);
}

const organization = readFileSync(resolve(root, "docs/CODE_ORGANIZATION.md"), "utf8");
for (const required of ["tests/e2e/", "cohesive responsibility", "Use `import type`"]) {
  if (!organization.includes(required)) {
    errors.push(`docs/CODE_ORGANIZATION.md: missing structural contract "${required}".`);
  }
}

for (const relativePath of [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "docs/CODE_ORGANIZATION.md",
  "docs/SESSION_HANDOFF.md",
  ...skills.map((skill) => `.agents/skills/${skill}/SKILL.md`)
]) {
  checkLocalLinks(relativePath);
}

if (errors.length > 0) {
  console.error("Harness validation failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Harness OK: ${skills.length} skills, docs within budgets, local links valid.`);

function checkLocalLinks(relativePath) {
  const absolutePath = resolve(root, relativePath);
  const content = readFileSync(absolutePath, "utf8");
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const resolved = resolve(dirname(absolutePath), decodeURIComponent(target));
    if (!existsSync(resolved)) errors.push(`${relativePath}: broken local link ${match[1]}.`);
  }
}

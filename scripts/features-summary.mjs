#!/usr/bin/env node
/**
 * Compact view of docs/FEATURES.json for session startup (progressive disclosure).
 *
 * The full file is ~130KB and ~64% historical `evidence` prose - reading all of it at session
 * start wastes most of an agent's context budget on shipped history. This prints only what
 * choosing the next task needs; fetch a single full entry by id when actually working on it.
 *
 *   node scripts/features-summary.mjs          state counts + every non-passing feature
 *   node scripts/features-summary.mjs F068     one feature's full entry (including evidence)
 *   node scripts/features-summary.mjs --all    one line per feature, including passing
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const { features } = JSON.parse(readFileSync(resolve(here, "../docs/FEATURES.json"), "utf8"));

const arg = process.argv[2];

if (arg && arg !== "--all") {
  const feature = features.find((f) => f.id === arg);
  if (!feature) {
    console.error(`No feature with id "${arg}".`);
    process.exit(1);
  }
  console.log(JSON.stringify(feature, null, 2));
  process.exit(0);
}

const counts = {};
for (const f of features) counts[f.state] = (counts[f.state] ?? 0) + 1;
console.log(
  `${features.length} features: ` +
    Object.entries(counts)
      .map(([state, n]) => `${n} ${state}`)
      .join(", ")
);

const line = (f) =>
  `${f.id}  ${f.state.padEnd(11)}  ${f.behavior.replace(/\s+/g, " ").slice(0, 110)}${f.behavior.length > 110 ? "…" : ""}`;

const shown = arg === "--all" ? features : features.filter((f) => f.state !== "passing");
if (shown.length > 0) {
  console.log("");
  for (const f of shown) console.log(line(f));
}
console.log("\nFull entry (behavior/verification/evidence/spec): pnpm features <id>");

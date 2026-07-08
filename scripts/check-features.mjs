#!/usr/bin/env node
/**
 * Validate docs/FEATURES.json as the single source of truth for feature state.
 *
 * Enforces the invariants documented in docs/FEATURES.md so the feature list can be trusted when
 * choosing the next task, judging completion, and writing the session handoff. Exits non-zero on
 * any violation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const featuresPath = resolve(here, "../docs/FEATURES.json");

const ALLOWED_STATES = ["not_started", "active", "blocked", "passing"];
// F### for backend/product features, DF-## for frontend/design-driven work (docs/NAMING.md).
const ID_PATTERN = /^(F\d{3}|DF-\d{2,})$/;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** @type {string[]} */
const errors = [];

let data;
try {
  data = JSON.parse(readFileSync(featuresPath, "utf8"));
} catch (error) {
  console.error(`Could not read or parse docs/FEATURES.json: ${error.message}`);
  process.exit(1);
}

const features = Array.isArray(data.features) ? data.features : null;
if (!features) {
  console.error("docs/FEATURES.json must contain a 'features' array.");
  process.exit(1);
}

const seenIds = new Set();
let activeCount = 0;

if (!Number.isInteger(data.nextIds?.F) || !Number.isInteger(data.nextIds?.DF)) {
  errors.push("'nextIds.F' and 'nextIds.DF' must be integers so pruned IDs are never reused.");
}

for (const [index, feature] of features.entries()) {
  const label = feature?.id ?? `#${index}`;

  if (typeof feature.id !== "string" || !ID_PATTERN.test(feature.id)) {
    errors.push(`Feature ${label}: id must match F### (e.g. F001) or DF-## (e.g. DF-01).`);
  } else if (seenIds.has(feature.id)) {
    errors.push(`Feature ${label}: duplicate id.`);
  } else {
    seenIds.add(feature.id);
  }

  if (typeof feature.behavior !== "string" || feature.behavior.trim() === "") {
    errors.push(`Feature ${label}: 'behavior' is required and must be non-empty.`);
  }

  if (typeof feature.verification !== "string" || feature.verification.trim() === "") {
    errors.push(`Feature ${label}: 'verification' command is required and must be non-empty.`);
  }

  if (!ALLOWED_STATES.includes(feature.state)) {
    errors.push(`Feature ${label}: 'state' must be one of ${ALLOWED_STATES.join(", ")}.`);
  }

  if (feature.state === "active") {
    activeCount += 1;
  }

  if (feature.state === "passing" && !nonEmpty(feature.evidence)) {
    errors.push(`Feature ${label}: 'passing' features must record non-empty 'evidence'.`);
  }

  if (feature.state === "passing" && !COMMIT_HASH_PATTERN.test(feature.commitHash ?? "")) {
    errors.push(
      `Feature ${label}: 'passing' features must record a 'commitHash' (the git SHA that made it pass).`
    );
  }

  if (feature.state === "passing" && !ISO_TIMESTAMP_PATTERN.test(feature.completedAt ?? "")) {
    errors.push(`Feature ${label}: 'passing' features must record ISO UTC 'completedAt'.`);
  }

  if (feature.state === "blocked" && !nonEmpty(feature.blockedReason)) {
    errors.push(`Feature ${label}: 'blocked' features must record a non-empty 'blockedReason'.`);
  }
}

for (const [prefix, next] of Object.entries(data.nextIds ?? {})) {
  const used = features
    .map((feature) => feature.id)
    .filter((id) => (prefix === "F" ? /^F\d+$/.test(id) : id.startsWith("DF-")))
    .map((id) => Number(id.replace(/\D/g, "")));
  if (used.some((id) => id >= next))
    errors.push(`nextIds.${prefix} must exceed every live ${prefix} ID.`);
}

if (activeCount > 1) {
  errors.push(`At most one feature may be 'active' at a time (found ${activeCount}).`);
}

if (errors.length > 0) {
  console.error("FEATURES.json validation failed:\n");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error("\nSee docs/FEATURES.md for the rules.");
  process.exit(1);
}

console.log(`FEATURES.json OK: ${features.length} features, ${activeCount} active.`);

/** @param {unknown} value */
function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

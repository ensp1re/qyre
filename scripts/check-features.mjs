#!/usr/bin/env node
/**
 * Validate docs/FEATURES.json as a harness primitive.
 *
 * Enforces the invariants documented in docs/FEATURES.md so the feature list can be trusted by the
 * scheduler, verifier, and session-handoff report. Exits non-zero on any violation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const featuresPath = resolve(here, "../docs/FEATURES.json");

const ALLOWED_STATES = ["not_started", "active", "blocked", "passing"];
const ID_PATTERN = /^F\d{3}$/;

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

for (const [index, feature] of features.entries()) {
  const label = feature?.id ?? `#${index}`;

  if (typeof feature.id !== "string" || !ID_PATTERN.test(feature.id)) {
    errors.push(`Feature ${label}: id must match F### (e.g. F001).`);
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

  if (feature.state === "blocked" && !nonEmpty(feature.blockedReason)) {
    errors.push(`Feature ${label}: 'blocked' features must record a non-empty 'blockedReason'.`);
  }
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

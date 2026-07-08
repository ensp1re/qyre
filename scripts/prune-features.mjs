#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "docs/FEATURES.json");
const data = JSON.parse(readFileSync(path, "utf8"));
const dryRun = process.argv.includes("--dry-run");
const nowArg = process.argv.find((arg) => arg.startsWith("--now="))?.slice(6);
const now = nowArg ? new Date(nowArg) : new Date();

if (Number.isNaN(now.getTime())) {
  console.error("--now must be a valid ISO timestamp.");
  process.exit(1);
}

const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
const retained = [];
const removed = [];

for (const feature of data.features) {
  if (feature.state !== "passing") {
    retained.push(feature);
    continue;
  }

  const completedAt = feature.completedAt ?? commitTimestamp(feature.commitHash);
  if (!completedAt) {
    console.error(`${feature.id}: cannot determine completedAt from commit ${feature.commitHash}.`);
    process.exit(1);
  }

  const completedTime = new Date(completedAt).getTime();
  if (Number.isNaN(completedTime)) {
    console.error(`${feature.id}: completedAt is not a valid timestamp.`);
    process.exit(1);
  }

  if (completedTime < cutoff) removed.push(feature.id);
  else retained.push({ ...feature, completedAt: new Date(completedTime).toISOString() });
}

if (!dryRun) {
  data.features = retained;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(
  `${dryRun ? "Would prune" : "Pruned"} ${removed.length} passing feature(s); ${retained.length} live entry/entries remain.`
);
if (removed.length > 0) {
  const shown = removed.slice(0, 20);
  const remainder = removed.length - shown.length;
  console.log(`${shown.join(", ")}${remainder > 0 ? `, … and ${remainder} more` : ""}`);
}

function commitTimestamp(commitHash) {
  if (!commitHash) return null;
  try {
    return execFileSync("git", ["show", "-s", "--format=%cI", commitHash], {
      cwd: root,
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}

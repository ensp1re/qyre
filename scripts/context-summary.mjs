#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const queue = JSON.parse(readFileSync(resolve(root, "docs/FEATURES.json"), "utf8"));
const requestedId = process.argv[2];
const selected = requestedId
  ? queue.features.find((feature) => feature.id === requestedId)
  : queue.features.find((feature) => feature.state === "active");

if (requestedId && !selected) {
  console.error(`No live feature with id "${requestedId}".`);
  process.exit(1);
}

const branch = git(["branch", "--show-current"]) || "detached HEAD";
const changes = git(["status", "--short"]).split("\n").filter(Boolean);
const counts = Object.fromEntries(queue.states.map((state) => [state, 0]));
for (const feature of queue.features) counts[feature.state] += 1;

console.log("Qyre working context");
console.log(`branch: ${branch}`);
console.log(`worktree: ${changes.length === 0 ? "clean" : `${changes.length} changed path(s)`}`);
console.log(
  `queue: ${queue.features.length} live (${queue.states.map((state) => `${counts[state]} ${state}`).join(", ")})`
);
console.log(`next ids: F${pad(queue.nextIds.F, 3)}, DF-${pad(queue.nextIds.DF, 2)}`);

if (selected) {
  console.log("");
  console.log(`${selected.id}: ${selected.state}`);
  console.log(`behavior: ${oneLine(selected.behavior, 180)}`);
  console.log(`verify: ${selected.verification}`);
  console.log(`spec: ${selected.spec ?? "none"}`);
} else {
  console.log("active: none");
}

const handoff = readFileSync(resolve(root, "docs/SESSION_HANDOFF.md"), "utf8");
for (const section of ["In progress", "Known issues / blockers", "Next steps"]) {
  const bullets = sectionBullets(handoff, section).slice(0, 2);
  if (bullets.length === 0) continue;
  console.log("");
  console.log(`${section.toLowerCase()}:`);
  for (const bullet of bullets) console.log(`- ${oneLine(bullet, 180)}`);
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function sectionBullets(markdown, heading) {
  const body = markdown.split(`## ${heading}`)[1]?.split("\n## ")[0] ?? "";
  const bullets = [];
  for (const line of body.split("\n")) {
    if (line.startsWith("- ")) bullets.push(line.slice(2));
    else if (line.trim() && bullets.length > 0) bullets[bullets.length - 1] += ` ${line.trim()}`;
  }
  return bullets;
}

function oneLine(value, limit) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

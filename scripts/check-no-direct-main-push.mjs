#!/usr/bin/env node
// Git pre-push hook body: refuse to push a `main` branch update directly.
// Feature work must land via a `feature/<ID>-<slug>` branch and a PR (see docs/NAMING.md).

import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const input = readStdin().trim();
if (!input) process.exit(0);

const pushesMain = input
  .split("\n")
  .filter(Boolean)
  .some((line) => {
    const [, , remoteRef] = line.split(/\s+/);
    return remoteRef === "refs/heads/main";
  });

if (pushesMain && !process.env.HUMB_ALLOW_MAIN_PUSH) {
  console.error(
    "\nRefusing to push directly to main.\n" +
      "Create a feature/<ID>-<slug> branch and open a PR instead (see docs/NAMING.md).\n" +
      "If this is a deliberate, user-approved exception, retry with HUMB_ALLOW_MAIN_PUSH=1.\n"
  );
  process.exit(1);
}

process.exit(0);

#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

// Derive the engine list from the shared constants source.
let connectionConstants;
try {
  connectionConstants = read("packages/core/src/constants/connection.ts");
} catch (error) {
  console.error(`Could not read packages/core/src/constants/connection.ts: ${error.message}`);
  process.exit(1);
}

const engines = [
  ...new Set(
    [...connectionConstants.matchAll(/^\s+\w+:\s*"([a-z]+)",?$/gm)].map((match) => match[1])
  )
].sort();

if (engines.length === 0) {
  console.error("Could not find any engine values in constants/connection.ts.");
  process.exit(1);
}

const cli = read("packages/cli/src/index.ts");
const publish = read("scripts/publish.mjs");

const errors = [];
for (const engine of engines) {
  const factoryName = `${engine}AdapterFactory`;
  if (!cli.includes(factoryName)) {
    errors.push(
      `packages/cli/src/index.ts doesn't reference ${factoryName} (the adapter/factory registry).`
    );
  }
  const packageName = `@qyre/${engine}`;
  if (!publish.includes(`"${packageName}"`)) {
    errors.push(`scripts/publish.mjs's PUBLISH_ORDER doesn't include "${packageName}".`);
  }
}

if (errors.length > 0) {
  console.error("Engine lists are out of lockstep (F053):\n");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log(
  `Engine lockstep OK: ${engines.join(", ")} all present in the CLI registry and PUBLISH_ORDER.`
);

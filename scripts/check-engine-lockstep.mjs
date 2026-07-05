#!/usr/bin/env node
/**
 * Validate that the three separately hand-maintained "which engines exist" lists stay in lockstep
 * (F053): `connection-target.ts`'s protocol detection, the CLI's adapter/factory registry, and
 * `scripts/publish.mjs`'s `PUBLISH_ORDER`. Adding a new engine driver but forgetting to wire it
 * into one of these has already happened once - `@qyre/mysql`/`@qyre/mongodb` were missing
 * from `PUBLISH_ORDER` until this check was added - so this fails loudly instead of relying on
 * someone noticing during a release.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

// connection-target.ts's protocol detection is the canonical source of "which engines exist" -
// every `{ engine: "x", ... }` return literal it produces.
let connectionTarget;
try {
  connectionTarget = read("packages/core/src/connection-target.ts");
} catch (error) {
  console.error(`Could not read packages/core/src/connection-target.ts: ${error.message}`);
  process.exit(1);
}

const engines = [
  ...new Set([...connectionTarget.matchAll(/engine:\s*"([a-z]+)"/g)].map((match) => match[1]))
].sort();

if (engines.length === 0) {
  console.error('Could not find any `engine: "..."` literals in connection-target.ts.');
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

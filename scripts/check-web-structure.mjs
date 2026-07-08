#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = resolve(root, "apps/web");
const srcRoot = resolve(webRoot, "src");
const testsRoot = resolve(webRoot, "tests");
const errors = [];

for (const legacyRoot of ["api", "components", "hooks"]) {
  if (existsSync(resolve(srcRoot, legacyRoot))) {
    errors.push(`apps/web/src/${legacyRoot}/: legacy flat responsibility root exists.`);
  }
}

for (const sourceFile of filesUnder(srcRoot)) {
  if (/\.test\.[cm]?[jt]sx?$/.test(sourceFile)) {
    errors.push(`${relative(root, sourceFile)}: tests belong under apps/web/tests/.`);
  }
}

for (const testFile of filesUnder(testsRoot)) {
  if (!/\.test\.[cm]?[jt]sx?$/.test(testFile)) continue;
  const mirrored = relative(testsRoot, testFile).replace(/\.test(\.[cm]?[jt]sx?)$/, "$1");
  if (!existsSync(resolve(srcRoot, mirrored))) {
    errors.push(`${relative(root, testFile)}: missing mirrored source owner src/${mirrored}.`);
  }
}

if (errors.length > 0) {
  console.error("Web structure validation failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("Web structure OK: owned areas and mirrored tests validated.");

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return extname(path) ? [path] : [];
  });
}

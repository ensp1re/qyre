#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = resolve(root, "apps/web");
const srcRoot = resolve(webRoot, "src");
const testsRoot = resolve(webRoot, "tests");
const errors = [];

for (const requiredLayer of ["app", "features", "shared"]) {
  if (!existsSync(resolve(srcRoot, requiredLayer))) {
    errors.push(`apps/web/src/${requiredLayer}/: required architecture layer is missing.`);
  }
}

for (const legacyRoot of [
  "api",
  "components",
  "connection",
  "console",
  "files",
  "hooks",
  "query",
  "schema",
  "table"
]) {
  if (existsSync(resolve(srcRoot, legacyRoot))) {
    errors.push(`apps/web/src/${legacyRoot}/: legacy flat responsibility root exists.`);
  }
}

for (const sourceFile of filesUnder(srcRoot)) {
  if (/\.test\.[cm]?[jt]sx?$/.test(sourceFile)) {
    errors.push(`${relative(root, sourceFile)}: tests belong under apps/web/tests/.`);
  }

  const sourceParts = relative(srcRoot, sourceFile).split(sep);
  if (sourceParts[0] === "features") {
    const segment = sourceParts[2];
    if (!segment || !["api", "assets", "config", "lib", "model", "ui"].includes(segment)) {
      errors.push(
        `${relative(root, sourceFile)}: feature files must live in an owned api/model/ui/lib/config/assets segment.`
      );
    }
  }

  for (const specifier of importSpecifiers(sourceFile)) {
    if (!specifier.startsWith(".")) continue;
    const target = resolveImport(sourceFile, specifier);
    if (!target) continue;
    validateDependency(sourceFile, target);
  }
}

for (const testFile of filesUnder(testsRoot)) {
  if (!/\.test\.[cm]?[jt]sx?$/.test(testFile)) continue;
  if (relative(testsRoot, testFile).split(sep).includes("support")) continue;
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

function validateDependency(sourceFile, targetFile) {
  const sourceParts = relative(srcRoot, sourceFile).split(sep);
  const targetParts = relative(srcRoot, targetFile).split(sep);
  const sourceLayer = sourceParts[0];
  const targetLayer = targetParts[0];

  if (sourceLayer === "shared" && ["app", "features"].includes(targetLayer)) {
    errors.push(
      `${relative(root, sourceFile)}: shared cannot import ${relative(srcRoot, targetFile)}.`
    );
  }
  if (sourceLayer === "features" && targetLayer === "app") {
    errors.push(`${relative(root, sourceFile)}: features cannot import app code.`);
  }
  if (
    sourceLayer === "features" &&
    targetLayer === "features" &&
    sourceParts[1] !== targetParts[1]
  ) {
    errors.push(
      `${relative(root, sourceFile)}: feature ${sourceParts[1]} cannot import feature ${targetParts[1]}.`
    );
  }
}

function importSpecifiers(sourceFile) {
  const source = readFile(sourceFile);
  return [...source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)].map((match) => match[1]);
}

function resolveImport(sourceFile, specifier) {
  const requested = resolve(dirname(sourceFile), specifier);
  for (const candidate of [
    requested,
    requested.replace(/\.js$/, ".ts"),
    requested.replace(/\.js$/, ".tsx")
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function readFile(path) {
  return readFileSync(path, "utf8");
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return extname(path) ? [path] : [];
  });
}

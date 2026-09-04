#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
// CI publishes an existing tag from a detached HEAD with provenance.
const ci = args.includes("--ci");
const onlyFlagIndex = args.indexOf("--only");
const onlyPackage = onlyFlagIndex !== -1 ? args[onlyFlagIndex + 1] : null;
if (onlyFlagIndex !== -1 && !onlyPackage) {
  console.error("--only requires a package name, e.g. --only qyre");
  process.exit(1);
}
const bumpType = onlyPackage
  ? null
  : (args.find((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--only") ?? "patch");
if (!onlyPackage && !["patch", "minor", "major", "publish"].includes(bumpType)) {
  console.error(`Unknown bump type "${bumpType}". Use patch, minor, major, or publish.`);
  process.exit(1);
}

/** Keep workspace dependencies publishable before their dependents. */
const PUBLISH_ORDER = [
  "@qyre/core",
  "@qyre/driver-contract",
  "@qyre/postgres",
  "@qyre/mysql",
  "@qyre/mongodb",
  "@qyre/sqlite",
  "@qyre/server",
  "@qyre/ui",
  "@qyre/qyre",
  // The unscoped alias depends on @qyre/qyre.
  "qyre"
];

function run(command, commandArgs, options = {}) {
  try {
    execFileSync(command, commandArgs, { stdio: "inherit", cwd: repoRoot, ...options });
  } catch (error) {
    console.error(`\nCommand failed: ${command} ${commandArgs.join(" ")}`);
    process.exit(typeof error.status === "number" ? error.status : 1);
  }
}

function runCapture(command, commandArgs) {
  return execFileSync(command, commandArgs, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function readPackageJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const gitStatus = runCapture("git", ["status", "--porcelain"]);
if (gitStatus) {
  console.error("Working tree is not clean. Commit or stash changes before publishing.");
  process.exit(1);
}

const workspacePackages = JSON.parse(runCapture("pnpm", ["-r", "list", "--json", "--depth", "-1"]));
const publishable = workspacePackages.filter((pkg) => pkg.private !== true);

const missingFromOrder = publishable.filter((pkg) => !PUBLISH_ORDER.includes(pkg.name));
if (missingFromOrder.length > 0) {
  console.error(
    "These publishable packages aren't in PUBLISH_ORDER (scripts/publish.mjs) - add them in " +
      "dependency order before publishing:\n" +
      missingFromOrder.map((pkg) => `  - ${pkg.name}`).join("\n")
  );
  process.exit(1);
}

const packagesByName = new Map(publishable.map((pkg) => [pkg.name, pkg]));
const orderedPackages = PUBLISH_ORDER.map((name) => packagesByName.get(name)).filter(Boolean);

if (onlyPackage) {
  const pkg = packagesByName.get(onlyPackage);
  if (!pkg) {
    console.error(`"${onlyPackage}" is not a publishable workspace package.`);
    process.exit(1);
  }
  const version = readPackageJson(join(pkg.path, "package.json")).version;
  console.log(`${dryRun ? "[dry run] " : ""}Publishing ${pkg.name}@${version} only...`);
  if (dryRun) {
    console.log("\nDry run: stopping before publish.");
    process.exit(0);
  }
  run("pnpm", ["publish", "--access", "public"], { cwd: pkg.path });
  console.log(`\nPublished ${pkg.name}@${version}.`);
  process.exit(0);
}

const cliPkg = packagesByName.get("@qyre/qyre");
if (!cliPkg) {
  console.error('Could not find the "@qyre/qyre" package among publishable packages.');
  process.exit(1);
}
const currentVersion = readPackageJson(join(cliPkg.path, "package.json")).version;

if (bumpType === "publish") {
  if (!ci) {
    const currentBranch = runCapture("git", ["branch", "--show-current"]);
    if (currentBranch !== "main") {
      console.error('Publishing must be run from the "main" branch.');
      process.exit(1);
    }
  }
  console.log(
    `${dryRun ? "[dry run] " : ""}Publishing current version v${currentVersion} to npm...`
  );

  if (dryRun) {
    console.log("\nDry run: stopping before verify/publish.");
    process.exit(0);
  }

  if (!ci) {
    run("pnpm", ["check"]);

    run("git", ["tag", `v${currentVersion}`]);
  }

  const publishArgs = ["publish", "--access", "public"];
  if (ci) publishArgs.push("--provenance", "--no-git-checks");
  for (const pkg of orderedPackages) {
    console.log(`Publishing ${pkg.name}@${currentVersion}...`);
    run("pnpm", publishArgs, { cwd: pkg.path });
  }

  console.log(
    ci
      ? `\nSuccessfully published v${currentVersion} with provenance.`
      : `\nSuccessfully published v${currentVersion}. Push the release tag with:\n` +
          `  git push origin v${currentVersion}`
  );
  process.exit(0);
}

const [major, minor, patch] = currentVersion.split(".").map(Number);
const nextVersion =
  bumpType === "major"
    ? `${major + 1}.0.0`
    : bumpType === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

console.log(
  `${dryRun ? "[dry run] " : ""}Bumping ${orderedPackages.length} publishable package(s): ` +
    `${currentVersion} -> ${nextVersion}`
);
for (const pkg of orderedPackages) {
  console.log(`  - ${pkg.name}`);
}

if (dryRun) {
  console.log("\nDry run: stopping before any files are written, built, or published.");
  process.exit(0);
}

for (const pkg of orderedPackages) {
  const pkgJsonPath = join(pkg.path, "package.json");
  const pkgJson = readPackageJson(pkgJsonPath);
  pkgJson.version = nextVersion;
  writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
}

run("pnpm", ["check"]);

const branchName = `chore/release-v${nextVersion}`;
run("git", ["checkout", "-b", branchName]);
run("git", ["add", "-A"]);
run("git", ["commit", "-m", `chore: release v${nextVersion}`]);

run("git", ["push", "-u", "origin", branchName]);

try {
  run("gh", [
    "pr",
    "create",
    "--title",
    `chore: release v${nextVersion}`,
    "--body",
    `Version bump to v${nextVersion} for release.`
  ]);
} catch {
  console.log(
    `\nFailed to create PR automatically. Please open a PR manually for branch "${branchName}".`
  );
}

console.log(
  `\nRelease branch "${branchName}" created and PR opened successfully!\n` +
    `Once the PR is merged into main, checkout main, pull the latest changes, and run:\n` +
    `  pnpm release publish`
);

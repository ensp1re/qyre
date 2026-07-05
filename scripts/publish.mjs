#!/usr/bin/env node
/**
 * Bump every publishable workspace package's version in lockstep and publish them to npm.
 *
 * All publishable packages share one version (the version users see via `npx qyre@x.y.z`) so
 * their `workspace:*` cross-references stay trivially in sync - pnpm resolves `workspace:*` to the
 * real version range from each package's local package.json at publish time, so bumping everything
 * together before publishing is enough; no manual dependency-range rewriting is needed.
 *
 * Usage: node scripts/publish.mjs [patch|minor|major] [--dry-run]
 *
 * To retry publishing a single package that failed last time (e.g. a registry hiccup, or a
 * name-policy block that's since been cleared) without re-bumping or re-checking everything:
 *   node scripts/publish.mjs --only <package-name> [--dry-run]
 * This publishes that one package at its current (already-committed) version - no version bump,
 * no `pnpm check`, no git commit/tag. Only use it to finish a release that already ran the full
 * flow above and got everything else published; it does not start a new release on its own.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
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

/**
 * Explicit publish order (dependency-first), so a package is never published before a workspace
 * dependency it needs is already resolvable. Kept explicit rather than topologically computed: the
 * package count is small and a new engine package (e.g. @qyre/sqlite, F008) forces a conscious
 * update here, which doubles as a reminder to wire it into the release.
 */
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
  // Bare-named alias package (packages/qyre) - depends on @qyre/qyre, so it must publish last.
  "qyre"
];

/**
 * Runs a command with its own stdout/stderr streamed straight through (so e.g. npm's own error
 * output is still visible in real time). On failure, prints one clean summary line and exits with
 * the child's real status code, instead of letting the raw execFileSync exception crash the whole
 * process with a Node-internals stack trace that has nothing to do with the actual failure.
 */
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

// 1. Require a clean working tree so a publish always corresponds to a committed, pushed state.
const gitStatus = runCapture("git", ["status", "--porcelain"]);
if (gitStatus) {
  console.error("Working tree is not clean. Commit or stash changes before publishing.");
  process.exit(1);
}

// 2. Discover publishable packages (private !== true) via pnpm's own workspace listing, rather
// than re-implementing workspace-glob resolution.
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

// --only: publish a single already-versioned package and stop, skipping the bump/check/commit
// steps below entirely (see the usage note at the top of this file).
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

// 3. Lockstep version: bump off the CLI package's current version, since that's the version users
// actually see.
const cliPkg = packagesByName.get("@qyre/qyre");
if (!cliPkg) {
  console.error('Could not find the "@qyre/qyre" package among publishable packages.');
  process.exit(1);
}
const currentVersion = readPackageJson(join(cliPkg.path, "package.json")).version;

// Handle the direct publish of current version (on main after PR is merged)
if (bumpType === "publish") {
  const currentBranch = runCapture("git", ["branch", "--show-current"]);
  if (currentBranch !== "main") {
    console.error('Publishing must be run from the "main" branch.');
    process.exit(1);
  }
  console.log(
    `${dryRun ? "[dry run] " : ""}Publishing current version v${currentVersion} to npm...`
  );

  if (dryRun) {
    console.log("\nDry run: stopping before verify/publish.");
    process.exit(0);
  }

  // Verify main is clean & passes check
  run("pnpm", ["check"]);

  // Create release tag locally
  run("git", ["tag", `v${currentVersion}`]);

  // Publish in dependency order
  for (const pkg of orderedPackages) {
    console.log(`Publishing ${pkg.name}@${currentVersion}...`);
    run("pnpm", ["publish", "--access", "public"], { cwd: pkg.path });
  }

  console.log(
    `\nSuccessfully published v${currentVersion}. Push the release tag with:\n` +
      `  git push origin v${currentVersion}`
  );
  process.exit(0);
}

// BUMP & PR WORKFLOW
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

// 4. Write the bumped version into every publishable package.json.
for (const pkg of orderedPackages) {
  const pkgJsonPath = join(pkg.path, "package.json");
  const pkgJson = readPackageJson(pkgJsonPath);
  pkgJson.version = nextVersion;
  writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
}

// 5. Run the full verification gate against the bumped versions
run("pnpm", ["check"]);

// 6. Create release branch and commit version bump
const branchName = `chore/release-v${nextVersion}`;
run("git", ["checkout", "-b", branchName]);
run("git", ["add", "-A"]);
run("git", ["commit", "-m", `chore: release v${nextVersion}`]);

// 7. Push the branch to origin
run("git", ["push", "-u", "origin", branchName, "--no-verify"]);

// 8. Create GitHub Pull Request
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

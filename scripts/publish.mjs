#!/usr/bin/env node
/**
 * Bump every publishable workspace package's version in lockstep and publish them to npm.
 *
 * All publishable packages share one version (the version users see via `npx humb@x.y.z`) so
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
  console.error("--only requires a package name, e.g. --only humb");
  process.exit(1);
}
const bumpType = onlyPackage
  ? null
  : (args.find((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--only") ?? "patch");
if (!onlyPackage && !["patch", "minor", "major"].includes(bumpType)) {
  console.error(`Unknown bump type "${bumpType}". Use patch, minor, or major.`);
  process.exit(1);
}

/**
 * Explicit publish order (dependency-first), so a package is never published before a workspace
 * dependency it needs is already resolvable. Kept explicit rather than topologically computed: the
 * package count is small and a new engine package (e.g. @humbdb/sqlite, F008) forces a conscious
 * update here, which doubles as a reminder to wire it into the release.
 */
const PUBLISH_ORDER = [
  "@humbdb/core",
  "@humbdb/driver-contract",
  "@humbdb/postgres",
  "@humbdb/sqlite",
  "@humbdb/server",
  "@humbdb/ui",
  "@humbdb/humb",
  // Bare-named alias package (packages/humb) - depends on @humbdb/humb, so it must publish last.
  "humb"
];

function run(command, commandArgs, options = {}) {
  execFileSync(command, commandArgs, { stdio: "inherit", cwd: repoRoot, ...options });
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
const cliPkg = packagesByName.get("@humbdb/humb");
if (!cliPkg) {
  console.error('Could not find the "@humbdb/humb" package among publishable packages.');
  process.exit(1);
}
const currentVersion = readPackageJson(join(cliPkg.path, "package.json")).version;
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

// 5. Run the full verification gate against the bumped versions before anything is committed or
// touches the registry. Requires HUMB_TEST_DATABASE_URL to be set (see docs/RELIABILITY.md) - we
// never silently skip required verification, including right before a release.
run("pnpm", ["check"]);

// 6. Commit + tag the release. Publishing happens against a clean, committed tree (below), so
// `pnpm publish` doesn't need --no-git-checks.
run("git", ["add", "-A"]);
run("git", ["commit", "-m", `chore: release v${nextVersion}`]);
run("git", ["tag", `v${nextVersion}`]);

// 7. Publish in dependency order. pnpm resolves each package's `workspace:*` internal deps to the
// real version range from the local package.json at pack time - no manual rewriting needed.
for (const pkg of orderedPackages) {
  console.log(`Publishing ${pkg.name}@${nextVersion}...`);
  run("pnpm", ["publish", "--access", "public"], { cwd: pkg.path });
}

console.log(
  `\nPublished v${nextVersion}. Push the release commit and tag with:\n` +
    "  git push && git push --tags"
);

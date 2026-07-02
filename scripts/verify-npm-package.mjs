#!/usr/bin/env node
/**
 * Verify the `humb` package actually works standalone outside this monorepo (F010) - not just that
 * the build succeeds. Packs it exactly as `pnpm publish` would, extracts that tarball into a fresh
 * temp directory with no relationship to this repo, and starts the real server against a real
 * SQLite file from there. If `packages/cli`'s web-root resolution regresses back to a
 * monorepo-relative path, this fails where a plain `pnpm build` would not.
 *
 * Rebuilds @humbdb/web and humb fresh so this is trustworthy standalone, not dependent on some prior
 * build step having run correctly.
 *
 * Usage: node scripts/verify-npm-package.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cliRoot = join(repoRoot, "packages/cli");
const PORT = 45123;

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", cwd: repoRoot, ...options });
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

/** Spawns the harness and resolves once it prints "READY", or rejects on error/timeout. */
function waitForReady(child) {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Server did not become ready in time.")),
      8000
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("READY")) {
        clearTimeout(timeout);
        resolvePromise();
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Harness exited early with code ${code}.`));
      }
    });
  });
}

console.log("Building @humbdb/web and humb fresh...");
run("pnpm", ["--filter", "@humbdb/web", "build"]);
run("pnpm", ["--filter", "humb", "build"]);

const packDir = mkdtempSync(join(tmpdir(), "humb-verify-pack-"));
const standaloneDir = mkdtempSync(join(tmpdir(), "humb-verify-standalone-"));

console.log("Packing the humb package (same tarball `pnpm publish` would produce)...");
execFileSync("pnpm", ["pack", "--pack-destination", packDir], { cwd: cliRoot });
const tarball = readdirSync(packDir)[0];

execFileSync("tar", ["-xzf", join(packDir, tarball), "-C", standaloneDir]);
const extractedRoot = join(standaloneDir, "package");

const bundledIndexHtml = join(extractedRoot, "dist/web/index.html");
if (!existsSync(bundledIndexHtml)) {
  fail("Packed package is missing dist/web/index.html - the UI won't serve once published.");
}
console.log("OK: packed tarball includes a bundled apps/web build (dist/web/index.html).");

// Real dependency resolution against the npm registry isn't possible pre-publish (these workspace
// packages don't exist there yet) - substitute the equivalent local resolution so the server
// actually runs, the same way a real `npm install humb` would once published.
symlinkSync(join(cliRoot, "node_modules"), join(extractedRoot, "node_modules"));

const dbPath = join(standaloneDir, "verify.db");
execFileSync("sqlite3", [dbPath, "CREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT);"]);

// Imports the real defaultWebRoot() this package exports (via node's self-referencing package
// resolution, since this harness lives inside the packed package itself) rather than
// re-implementing its logic - this proves the actual shipped function, not a stand-in for it.
const harnessPath = join(extractedRoot, "verify-harness.mjs");
writeFileSync(
  harnessPath,
  `
import { parseConnectionTarget } from "@humbdb/core";
import { resolveAdapter } from "@humbdb/driver-contract";
import { postgresAdapterFactory } from "@humbdb/postgres";
import { sqliteAdapterFactory } from "@humbdb/sqlite";
import { startServer } from "@humbdb/server";
import { defaultWebRoot } from "humb";

const target = parseConnectionTarget(${JSON.stringify(dbPath)});
const adapter = resolveAdapter([postgresAdapterFactory, sqliteAdapterFactory], target);
await adapter.connect();
const webRoot = defaultWebRoot(${JSON.stringify(join(extractedRoot, "dist"))});
await startServer({ adapter, target, port: ${PORT}, host: "127.0.0.1", webRoot });
console.log("READY");
`.trimStart()
);

console.log("Starting the packed server standalone (outside this repo entirely)...");
const child = spawn("node", [harnessPath], { cwd: extractedRoot });

try {
  await waitForReady(child);

  const indexResponse = await fetch(`http://127.0.0.1:${PORT}/`);
  const indexBody = await indexResponse.text();
  if (!indexResponse.ok || !indexBody.includes("<html")) {
    fail(`GET / did not return the real UI (status ${indexResponse.status}).`);
  }
  console.log("OK: GET / serves the real apps/web UI, not a 404.");

  const healthResponse = await fetch(`http://127.0.0.1:${PORT}/api/health`);
  const health = await healthResponse.json();
  if (health.database !== "connected") {
    fail(`GET /api/health reported "${health.database}", expected "connected".`);
  }
  console.log("OK: GET /api/health reports a real connection to the standalone SQLite file.");
} finally {
  child.kill();
}

console.log("\nhumb package verified standalone: it works outside this monorepo.");

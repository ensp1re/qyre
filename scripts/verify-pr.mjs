#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, delimiter } from "node:path";

const branch = capture("git", ["branch", "--show-current"]);
if (!branch || branch === "main" || branch === "master") {
  fail("PR verification must run from a non-default branch.");
}

const docker = findDocker();
if (!docker) {
  fail(
    "Docker is unavailable. Start Docker Desktop or set QYRE_DOCKER_BIN to the Docker CLI path."
  );
}

console.log(`Preparing local test databases with ${docker}...`);
run(docker, ["compose", "up", "-d", "--wait"], dockerEnvironment(docker));

const env = {
  ...process.env,
  QYRE_TEST_DATABASE_URL:
    process.env.QYRE_TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/qyre_test",
  QYRE_TEST_MYSQL_URL:
    process.env.QYRE_TEST_MYSQL_URL ?? "mysql://root:root@localhost:3306/qyre_test",
  QYRE_TEST_MONGO_URL: process.env.QYRE_TEST_MONGO_URL ?? "mongodb://localhost:27017/qyre_test"
};

console.log("Databases are healthy. Running the complete local PR gate...");
run("pnpm", ["check:quiet"], env);
run("pnpm", ["test:e2e"], env);
run("pnpm", ["test:e2e:full"], env);
console.log("PR verification passed: checks, build, smoke E2E, and full E2E.");

function findDocker() {
  const candidates = [
    process.env.QYRE_DOCKER_BIN,
    "docker",
    "/Applications/Docker.app/Contents/Resources/bin/docker"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("/") && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ["version", "--format", "{{.Server.Version}}"], {
      encoding: "utf8"
    });
    if (result.status === 0) return candidate;
  }
  return null;
}

function dockerEnvironment(command) {
  if (!command.includes("/")) return process.env;
  return { ...process.env, PATH: `${dirname(command)}${delimiter}${process.env.PATH ?? ""}` };
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectionTarget } from "@humbdb/core";
import { describe, expect, it } from "vitest";
import { mongodbAdapterFactory } from "./index.js";

describe("mongodbAdapterFactory", () => {
  it("supports mongodb targets", () => {
    const target: ConnectionTarget = { engine: "mongodb", raw: "mongodb://localhost/db" };
    expect(mongodbAdapterFactory.supports(target)).toBe(true);
  });

  it("does not support postgres targets", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://localhost/db" };
    expect(mongodbAdapterFactory.supports(target)).toBe(false);
  });

  it("creates an adapter with the mongodb engine", () => {
    const target: ConnectionTarget = { engine: "mongodb", raw: "mongodb://localhost/db" };
    const adapter = mongodbAdapterFactory.create(target);
    expect(adapter.engine).toBe("mongodb");
  });
});

// MongoDB has no server-enforced read-only mode to fall back on (see this spec's "Read-only
// enforcement" section) - the guarantee for this basic-browse pass is instead that the adapter's
// own code path never calls a Mongo write API. This is the "lint-style check" that spec
// explicitly calls for: fails loudly if a future change adds a write call, rather than relying
// solely on code review to catch it.
const WRITE_METHODS = [
  "insertOne",
  "insertMany",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "bulkWrite",
  "createIndex",
  "createIndexes",
  "dropIndex",
  "dropIndexes",
  "createCollection",
  "renameCollection",
  ".drop(",
  "dropDatabase"
];

describe("read-only enforcement", () => {
  it("the adapter's source contains no Mongo write API calls", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "index.ts"), "utf-8");
    for (const method of WRITE_METHODS) {
      expect(source, `source must not call ${method}`).not.toContain(method);
    }
  });
});

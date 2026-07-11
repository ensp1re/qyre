import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectionTarget } from "@qyre/core";
import {
  Binary,
  BSONRegExp,
  BSONSymbol,
  Code,
  Decimal128,
  Long,
  MaxKey,
  MinKey,
  ObjectId,
  Timestamp
} from "mongodb";
import { describe, expect, it } from "vitest";
import {
  classifyBsonValue,
  coerceFilterValue,
  inferColumns,
  mongodbAdapterFactory,
  normalizeBsonValue
} from "../src/index.js";

describe("normalizeBsonValue", () => {
  it("preserves a Timestamp's {t, i} semantics instead of misreading it as a signed Long (F045)", () => {
    const ts = Timestamp.fromBits(5, 1700000000);
    expect(ts).toBeInstanceOf(Long);
    expect(normalizeBsonValue(ts)).toEqual({ t: 1700000000, i: 5 });
  });

  it("still normalizes a plain Long as a signed 64-bit integer", () => {
    expect(normalizeBsonValue(Long.fromNumber(42))).toBe(42);
  });

  it("normalizes Code with its scope", () => {
    const code = new Code("function() { return 1; }", { a: 1 });
    expect(normalizeBsonValue(code)).toEqual({
      code: "function() { return 1; }",
      scope: { a: 1 }
    });
  });

  it("normalizes BSONRegExp to its pattern/options", () => {
    const re = new BSONRegExp("^abc", "i");
    expect(normalizeBsonValue(re)).toEqual({ pattern: "^abc", options: "i" });
  });

  it("normalizes a native RegExp - the shape the driver actually decodes a BSON regex into by default", () => {
    expect(normalizeBsonValue(/^abc/i)).toEqual({ pattern: "^abc", options: "i" });
  });

  it("normalizes MinKey/MaxKey to extended-JSON-style sentinels", () => {
    expect(normalizeBsonValue(new MinKey())).toEqual({ $minKey: 1 });
    expect(normalizeBsonValue(new MaxKey())).toEqual({ $maxKey: 1 });
  });

  it("normalizes BSONSymbol to its plain string value", () => {
    expect(normalizeBsonValue(new BSONSymbol("mysym"))).toBe("mysym");
  });
});

describe("classifyBsonValue", () => {
  it("classifies primitives", () => {
    expect(classifyBsonValue("hi")).toBe("string");
    expect(classifyBsonValue(42)).toBe("number");
    expect(classifyBsonValue(true)).toBe("boolean");
    expect(classifyBsonValue(null)).toBe("null");
    expect(classifyBsonValue(undefined)).toBe("null");
  });

  it("classifies BSON-specific instances", () => {
    expect(classifyBsonValue(new ObjectId())).toBe("objectId");
    expect(classifyBsonValue(new Date())).toBe("date");
    expect(classifyBsonValue(new Binary(Buffer.from("x")))).toBe("binary");
    expect(classifyBsonValue([1, 2, 3])).toBe("array");
    expect(classifyBsonValue(Long.fromNumber(42))).toBe("number");
    expect(classifyBsonValue(Decimal128.fromString("1.5"))).toBe("number");
  });

  it("classifies MinKey/MaxKey as structured objects, not user-facing scalar filter types", () => {
    expect(classifyBsonValue(new MinKey())).toBe("object");
    expect(classifyBsonValue(new MaxKey())).toBe("object");
  });

  it("classifies a plain nested document as object", () => {
    expect(classifyBsonValue({ a: 1 })).toBe("object");
  });
});

describe("coerceFilterValue (F082)", () => {
  it("coerces a plain hex string to ObjectId for an objectId column", () => {
    const id = new ObjectId();
    expect(coerceFilterValue(id.toHexString(), "objectId")).toEqual(id);
  });

  it("falls back to the raw string when it isn't a valid ObjectId", () => {
    expect(coerceFilterValue("not-an-id", "objectId")).toBe("not-an-id");
  });

  it("coerces the true/false strings the FilterBar picker sends for a boolean column", () => {
    expect(coerceFilterValue("true", "boolean")).toBe(true);
    expect(coerceFilterValue("false", "boolean")).toBe(false);
  });

  it("does not coerce MinKey/MaxKey tokens from scalar filter input", () => {
    expect(coerceFilterValue("$minKey", "minKey")).toBe("$minKey");
    expect(coerceFilterValue("anything", "maxKey")).toBe("anything");
  });
});

describe("inferColumns", () => {
  it("infers a single consistent type as non-nullable when present on every document", () => {
    const columns = inferColumns([{ name: "Ada" }, { name: "Alan" }]);
    expect(columns).toEqual([
      {
        name: "name",
        dataType: "string",
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false
      }
    ]);
  });

  it("marks a field nullable when absent from some sampled documents", () => {
    const columns = inferColumns([{ a: 1, b: 2 }, { a: 1 }]);
    const b = columns.find((c) => c.name === "b");
    expect(b?.nullable).toBe(true);
  });

  it("marks a field nullable when explicitly null in some document, even if present everywhere", () => {
    const columns = inferColumns([{ a: 1 }, { a: null }]);
    const a = columns.find((c) => c.name === "a");
    expect(a?.dataType).toBe("number");
    expect(a?.nullable).toBe(true);
  });

  it("reports dataType 'mixed' when a field's type varies across the sample", () => {
    const columns = inferColumns([{ a: 1 }, { a: "one" }]);
    expect(columns.find((c) => c.name === "a")?.dataType).toBe("mixed");
  });

  it("reports dataType 'null' for a field that is only ever explicitly null", () => {
    const columns = inferColumns([{ a: null }, { a: null }]);
    const a = columns.find((c) => c.name === "a");
    expect(a?.dataType).toBe("null");
    expect(a?.nullable).toBe(true);
  });

  it("returns no columns for an empty sample", () => {
    expect(inferColumns([])).toEqual([]);
  });
});

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
    const sourceDirectory = join(here, "../src");
    const source = readdirSync(sourceDirectory)
      // permissions.ts (F095) legitimately contains MongoDB's own privilege *action-name*
      // vocabulary as string literals (e.g. "createCollection", "createIndex" in an actions array
      // read from connectionStatus{showPrivileges:true}) - the same words as real write methods,
      // but never called as one; it only ever reads via client.db().command(...). Excluded here so
      // this scan keeps catching an actual accidental write call elsewhere without a permanent
      // false positive on that vocabulary.
      .filter((name) => name.endsWith(".ts") && name !== "permissions.ts")
      .map((name) => readFileSync(join(sourceDirectory, name), "utf-8"))
      .join("\n");
    for (const method of WRITE_METHODS) {
      expect(source, `source must not call ${method}`).not.toContain(method);
    }
  });

  it("permissions.ts's privilege-action vocabulary never appears as an actual method call", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "../src/permissions.ts"), "utf-8");
    for (const method of WRITE_METHODS) {
      const callPattern = method.endsWith("(") ? method : `${method}(`;
      expect(source, `permissions.ts must not call ${method}`).not.toContain(callPattern);
    }
  });
});

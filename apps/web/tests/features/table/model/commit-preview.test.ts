import type { MutationOp } from "@qyre/core";
import { describe, expect, it } from "vitest";
import {
  buildMutationOps,
  buildPreviewLine,
  parseRowKey
} from "../../../../src/features/table/model/editing/commit-preview.js";
import {
  applyAddInsert,
  applyStageDelete,
  applyStageEdit,
  applyUpdateInsertValue,
  computeRowKey,
  type PendingEdits,
  type PendingInserts
} from "../../../../src/features/table/model/editing/pending-changes.js";

describe("parseRowKey (F105)", () => {
  it("round-trips a row key back to its primary-key value map", () => {
    const rowKey = computeRowKey({ id: 1, org_id: 2, name: "Ada" }, ["id", "org_id"]);
    expect(parseRowKey(rowKey)).toEqual({ id: 1, org_id: 2 });
  });
});

describe("buildMutationOps (F105)", () => {
  it("builds one insert op per staged draft, in order", () => {
    let inserts: PendingInserts = applyAddInsert([], "insert-0");
    inserts = applyUpdateInsertValue(inserts, "insert-0", "name", "Ada");
    const ops = buildMutationOps("public", "users", new Map(), inserts, new Set());
    expect(ops).toEqual([
      { type: "insert", schema: "public", table: "users", values: { name: "Ada" } }
    ]);
  });

  it("builds one update op per dirty row, with every staged column's changes combined", () => {
    const rowKey = computeRowKey({ id: 1 }, ["id"]);
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, rowKey, "name", "Ada", "Grace");
    edits = applyStageEdit(edits, rowKey, "email", "a@x.com", "b@x.com");
    const ops = buildMutationOps("public", "users", edits, [], new Set());
    expect(ops).toEqual([
      {
        type: "update",
        schema: "public",
        table: "users",
        key: { id: 1 },
        changes: { name: "Grace", email: "b@x.com" },
        originalValues: { name: "Ada", email: "a@x.com" },
        missingOriginalFields: []
      }
    ]);
  });

  it("batches every staged delete key into one delete op", () => {
    const rowKeyA = computeRowKey({ id: 1 }, ["id"]);
    const rowKeyB = computeRowKey({ id: 2 }, ["id"]);
    let deletes = applyStageDelete(new Set<string>(), rowKeyA);
    deletes = applyStageDelete(deletes, rowKeyB);
    const ops = buildMutationOps("public", "users", new Map(), [], deletes);
    expect(ops).toEqual([
      { type: "delete", schema: "public", table: "users", keys: [{ id: 1 }, { id: 2 }] }
    ]);
  });

  it("omits the delete op entirely when nothing is staged for deletion", () => {
    const ops = buildMutationOps("public", "users", new Map(), [], new Set());
    expect(ops).toEqual([]);
  });

  it("orders inserts, then updates, then one delete op", () => {
    const inserts = applyAddInsert([], "insert-0", { name: "Ada" });
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, computeRowKey({ id: 1 }, ["id"]), "name", "Old", "New");
    const deletes = applyStageDelete(new Set<string>(), computeRowKey({ id: 9 }, ["id"]));
    const ops = buildMutationOps("public", "users", edits, inserts, deletes);
    expect(ops.map((op) => op.type)).toEqual(["insert", "update", "delete"]);
  });
});

describe("buildPreviewLine (F105)", () => {
  it("formats an insert with quoted string values and bare numbers", () => {
    const op: MutationOp = {
      type: "insert",
      schema: "public",
      table: "users",
      values: { name: "Ada", age: 42 }
    };
    expect(buildPreviewLine(op)).toBe(
      `INSERT INTO "public"."users" (name, age) VALUES ('Ada', 42)`
    );
  });

  it("formats an all-default insert with no columns", () => {
    const op: MutationOp = { type: "insert", schema: "public", table: "users", values: {} };
    expect(buildPreviewLine(op)).toBe(`INSERT INTO "public"."users" DEFAULT VALUES`);
  });

  it("formats an update with its WHERE clause from the key", () => {
    const op: MutationOp = {
      type: "update",
      schema: "public",
      table: "users",
      key: { id: 1 },
      changes: { name: "Grace" }
    };
    expect(buildPreviewLine(op)).toBe(`UPDATE "public"."users" SET name = 'Grace' WHERE id = 1`);
  });

  it("formats a delete with an OR'd WHERE clause across every key", () => {
    const op: MutationOp = {
      type: "delete",
      schema: "public",
      table: "users",
      keys: [{ id: 1 }, { id: 2 }]
    };
    expect(buildPreviewLine(op)).toBe(`DELETE FROM "public"."users" WHERE (id = 1) OR (id = 2)`);
  });

  it("escapes an embedded single quote in a string value", () => {
    const op: MutationOp = {
      type: "insert",
      schema: "public",
      table: "users",
      values: { name: "O'Brien" }
    };
    expect(buildPreviewLine(op)).toBe(`INSERT INTO "public"."users" (name) VALUES ('O''Brien')`);
  });

  it("renders null and boolean values without quotes", () => {
    const op: MutationOp = {
      type: "insert",
      schema: "public",
      table: "users",
      values: { active: true, note: null }
    };
    expect(buildPreviewLine(op)).toBe(
      `INSERT INTO "public"."users" (active, note) VALUES (true, NULL)`
    );
  });

  it("renders MongoDB operations as JSON rather than SQL", () => {
    const op: MutationOp = {
      type: "update",
      schema: "app",
      table: "users",
      key: { _id: "507f1f77bcf86cd799439011" },
      changes: { name: "Grace" }
    };
    expect(JSON.parse(buildPreviewLine(op, "mongodb"))).toEqual({
      updateOne: {
        filter: { _id: "507f1f77bcf86cd799439011" },
        update: { $set: { name: "Grace" } }
      }
    });
  });
});

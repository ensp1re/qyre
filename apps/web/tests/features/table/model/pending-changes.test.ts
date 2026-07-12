import { describe, expect, it } from "vitest";
import {
  applyAddInsert,
  applyRemoveInsert,
  applyRemoveRowEdits,
  applyRevertEdit,
  applyStageDelete,
  applyStageEdit,
  applyUnstageDelete,
  applyUpdateInsertValue,
  computeRowKey,
  countPendingEdits,
  type PendingEdits,
  type PendingInserts
} from "../../../../src/features/table/model/pending-changes.js";

describe("applyStageEdit / applyRevertEdit (F103)", () => {
  it("stages an edit under its row key and column", () => {
    const edits: PendingEdits = new Map();
    const next = applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    expect(next.get("row-1")?.get("name")).toEqual({ original: "Ada", next: "Grace" });
  });

  it("does not mutate the input map (immutable update)", () => {
    const edits: PendingEdits = new Map();
    applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    expect(edits.size).toBe(0);
  });

  it("overwrites a previous staged edit for the same cell", () => {
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    edits = applyStageEdit(edits, "row-1", "name", "Ada", "Alan");
    expect(edits.get("row-1")?.get("name")).toEqual({ original: "Ada", next: "Alan" });
  });

  it("keeps other columns on the same row independent", () => {
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    edits = applyStageEdit(edits, "row-1", "email", "a@x.com", "b@x.com");
    expect(edits.get("row-1")?.size).toBe(2);
  });

  it("reverts a staged edit, removing just that column", () => {
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    edits = applyStageEdit(edits, "row-1", "email", "a@x.com", "b@x.com");
    edits = applyRevertEdit(edits, "row-1", "name");
    expect(edits.get("row-1")?.has("name")).toBe(false);
    expect(edits.get("row-1")?.has("email")).toBe(true);
  });

  it("removes the row entirely once its last staged edit is reverted", () => {
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    edits = applyRevertEdit(edits, "row-1", "name");
    expect(edits.has("row-1")).toBe(false);
  });

  it("reverting a cell with no staged edit is a no-op, returning the same reference", () => {
    const edits: PendingEdits = new Map();
    const result = applyRevertEdit(edits, "row-1", "name");
    expect(result).toBe(edits);
  });
});

describe("countPendingEdits (F103)", () => {
  it("counts every staged cell edit across every row", () => {
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    edits = applyStageEdit(edits, "row-1", "email", "a@x.com", "b@x.com");
    edits = applyStageEdit(edits, "row-2", "name", "Bob", "Robert");
    expect(countPendingEdits(edits)).toBe(3);
  });

  it("is 0 for an empty buffer", () => {
    expect(countPendingEdits(new Map())).toBe(0);
  });
});

describe("computeRowKey (F103)", () => {
  it("produces the same key regardless of primary-key column order", () => {
    const row = { id: 1, org_id: 2, name: "Ada" };
    expect(computeRowKey(row, ["id", "org_id"])).toBe(computeRowKey(row, ["org_id", "id"]));
  });

  it("produces different keys for different primary-key values", () => {
    expect(computeRowKey({ id: 1 }, ["id"])).not.toBe(computeRowKey({ id: 2 }, ["id"]));
  });
});

describe("applyAddInsert / applyUpdateInsertValue / applyRemoveInsert (F104)", () => {
  it("appends a new draft row with the given id and initial values", () => {
    const inserts: PendingInserts = [];
    const next = applyAddInsert(inserts, "insert-0", { name: "Ada" });
    expect(next).toEqual([{ id: "insert-0", values: { name: "Ada" } }]);
  });

  it("defaults to an empty values map when none is given", () => {
    const next = applyAddInsert([], "insert-0");
    expect(next[0]?.values).toEqual({});
  });

  it("does not mutate the input array (immutable update)", () => {
    const inserts: PendingInserts = [];
    applyAddInsert(inserts, "insert-0");
    expect(inserts.length).toBe(0);
  });

  it("sets a column's value on the matching draft row only", () => {
    let inserts: PendingInserts = applyAddInsert([], "insert-0");
    inserts = applyAddInsert(inserts, "insert-1");
    inserts = applyUpdateInsertValue(inserts, "insert-0", "name", "Ada");
    expect(inserts[0]?.values).toEqual({ name: "Ada" });
    expect(inserts[1]?.values).toEqual({});
  });

  it("removes the column from values when set to undefined - back to untouched", () => {
    let inserts: PendingInserts = applyAddInsert([], "insert-0");
    inserts = applyUpdateInsertValue(inserts, "insert-0", "name", "Ada");
    inserts = applyUpdateInsertValue(inserts, "insert-0", "name", undefined);
    expect(inserts[0]?.values).toEqual({});
  });

  it("discards a whole draft row", () => {
    let inserts: PendingInserts = applyAddInsert([], "insert-0");
    inserts = applyAddInsert(inserts, "insert-1");
    inserts = applyRemoveInsert(inserts, "insert-0");
    expect(inserts.map((insert) => insert.id)).toEqual(["insert-1"]);
  });
});

describe("applyStageDelete / applyUnstageDelete (F105)", () => {
  it("stages a row for deletion", () => {
    const deletes = applyStageDelete(new Set(), "row-1");
    expect(deletes.has("row-1")).toBe(true);
  });

  it("does not mutate the input set (immutable update)", () => {
    const deletes = new Set<string>();
    applyStageDelete(deletes, "row-1");
    expect(deletes.size).toBe(0);
  });

  it("staging an already-staged row is a no-op, returning the same reference", () => {
    const deletes = applyStageDelete(new Set(), "row-1");
    expect(applyStageDelete(deletes, "row-1")).toBe(deletes);
  });

  it("un-stages a row's deletion", () => {
    let deletes = applyStageDelete(new Set(), "row-1");
    deletes = applyUnstageDelete(deletes, "row-1");
    expect(deletes.has("row-1")).toBe(false);
  });

  it("un-staging a row that isn't staged is a no-op, returning the same reference", () => {
    const deletes = new Set<string>();
    expect(applyUnstageDelete(deletes, "row-1")).toBe(deletes);
  });
});

describe("applyRemoveRowEdits (F105)", () => {
  it("drops every staged cell edit for one row", () => {
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    edits = applyStageEdit(edits, "row-1", "email", "a@x.com", "b@x.com");
    edits = applyRemoveRowEdits(edits, "row-1");
    expect(edits.has("row-1")).toBe(false);
  });

  it("leaves other rows untouched", () => {
    let edits: PendingEdits = new Map();
    edits = applyStageEdit(edits, "row-1", "name", "Ada", "Grace");
    edits = applyStageEdit(edits, "row-2", "name", "Bob", "Robert");
    edits = applyRemoveRowEdits(edits, "row-1");
    expect(edits.has("row-2")).toBe(true);
  });

  it("is a no-op for a row with no staged edits, returning the same reference", () => {
    const edits: PendingEdits = new Map();
    expect(applyRemoveRowEdits(edits, "row-1")).toBe(edits);
  });
});

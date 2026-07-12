import { describe, expect, it } from "vitest";
import {
  applyRevertEdit,
  applyStageEdit,
  computeRowKey,
  countPendingEdits,
  type PendingEdits
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

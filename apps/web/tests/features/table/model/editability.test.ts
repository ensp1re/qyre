import type { ColumnMetadata, ConnectionCapabilities, TableMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { computeTableEditability } from "../../../../src/features/table/model/editability.js";

const WRITABLE_CAPABILITIES: ConnectionCapabilities = {
  supportsSql: true,
  supportsRowMutations: true,
  supportsDdl: true,
  supportsIndexManagement: true,
  supportsDatabaseManagement: true,
  supportsTransactions: true,
  readOnlyReason: null
};

const columns: ColumnMetadata[] = [
  { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false },
  { name: "tags", dataType: "jsonb", nullable: true, isPrimaryKey: false, isForeignKey: false }
];

const EDITABLE_TABLE: TableMetadata = {
  schema: "public",
  name: "users",
  kind: "table",
  columns,
  permissions: { select: true, insert: true, update: true, delete: true }
};

describe("computeTableEditability (F103)", () => {
  it("allows editing a table with full write access, excluding the primary key and structured columns", () => {
    const result = computeTableEditability(EDITABLE_TABLE, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(true);
    expect(result.editableColumns.has("name")).toBe(true);
    expect(result.editableColumns.has("id")).toBe(false);
    expect(result.editableColumns.has("tags")).toBe(false);
  });

  it("disables editing entirely for MongoDB - its editing surface is F125's document editor", () => {
    const result = computeTableEditability(EDITABLE_TABLE, WRITABLE_CAPABILITIES, "mongodb");
    expect(result.editable).toBe(false);
    expect(result.editableColumns.size).toBe(0);
  });

  it("disables editing for a view, with a reason", () => {
    const view: TableMetadata = { ...EDITABLE_TABLE, kind: "view" };
    const result = computeTableEditability(view, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(false);
    expect(result.reason).toMatch(/view/i);
  });

  it("disables editing for a materialized view, with a distinct reason", () => {
    const view: TableMetadata = { ...EDITABLE_TABLE, kind: "materialized-view" };
    const result = computeTableEditability(view, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(false);
    expect(result.reason).toMatch(/materialized/i);
  });

  it("disables editing for a table with no primary key", () => {
    const noPk: TableMetadata = {
      ...EDITABLE_TABLE,
      columns: columns.map((column) => ({ ...column, isPrimaryKey: false }))
    };
    const result = computeTableEditability(noPk, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(false);
    expect(result.reason).toMatch(/primary key/i);
  });

  it("disables editing for a read-only session, surfacing the --read-only reason", () => {
    const readOnly: ConnectionCapabilities = {
      ...WRITABLE_CAPABILITIES,
      supportsRowMutations: false,
      readOnlyReason: "qyre-flag"
    };
    const result = computeTableEditability(EDITABLE_TABLE, readOnly, "postgres");
    expect(result.editable).toBe(false);
    expect(result.reason).toMatch(/--read-only/);
  });

  it("disables editing when the table lacks update permission", () => {
    const noUpdate: TableMetadata = {
      ...EDITABLE_TABLE,
      permissions: { select: true, insert: true, update: false, delete: true }
    };
    const result = computeTableEditability(noUpdate, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(false);
    expect(result.reason).toMatch(/permission/i);
  });

  it("disables editing entirely when the table hasn't loaded yet", () => {
    const result = computeTableEditability(undefined, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(false);
    expect(result.editableColumns.size).toBe(0);
  });
});

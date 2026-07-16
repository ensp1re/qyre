import type { ColumnMetadata, ConnectionCapabilities, TableMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { computeTableEditability } from "../../../../src/features/table/model/editing/editability.js";

const WRITABLE_CAPABILITIES: ConnectionCapabilities = {
  supportsSql: true,
  rowExportFormats: ["csv", "json", "sql"],
  jsonExportMode: "json",
  supportsAccessInspection: true,
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

const EDITABLE_COLLECTION: TableMetadata = {
  schema: "app",
  name: "users",
  kind: "collection",
  columns: [
    {
      name: "_id",
      dataType: "objectId",
      nullable: false,
      isPrimaryKey: true,
      isForeignKey: false
    },
    {
      name: "name",
      dataType: "string",
      nullable: false,
      isPrimaryKey: false,
      isForeignKey: false
    },
    {
      name: "profile",
      dataType: "object",
      nullable: true,
      isPrimaryKey: false,
      isForeignKey: false
    }
  ],
  permissions: { select: true, insert: true, update: true, delete: true }
};

describe("computeTableEditability (F103)", () => {
  it("allows editing a table with full write access, excluding the primary key", () => {
    const result = computeTableEditability(EDITABLE_TABLE, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(true);
    expect(result.editableColumns.has("name")).toBe(true);
    expect(result.editableColumns.has("id")).toBe(false);
    expect(result.editableColumns.has("tags")).toBe(true);
  });

  it("uses the shared typed grid for MongoDB collections", () => {
    const result = computeTableEditability(EDITABLE_COLLECTION, WRITABLE_CAPABILITIES, "mongodb");
    expect(result.editable).toBe(true);
    expect(result.editableColumns).toEqual(new Set(["name", "profile"]));
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

  it.each([
    ["postgres", "timestamp with time zone"],
    ["postgres", "time without time zone"],
    ["mysql", "datetime(6)"],
    ["mysql", "time(6)"],
    ["sqlite", "TIMESTAMP"]
  ] as const)("keeps exact temporal editing available for %s %s columns", (engine, dataType) => {
    const table: TableMetadata = {
      ...EDITABLE_TABLE,
      columns: [
        ...columns,
        {
          name: "temporal_value",
          dataType,
          nullable: true,
          isPrimaryKey: false,
          isForeignKey: false
        }
      ]
    };
    const result = computeTableEditability(table, WRITABLE_CAPABILITIES, engine);
    expect(result.editableColumns.has("temporal_value")).toBe(true);
    expect(result.insertableColumns.has("temporal_value")).toBe(true);
  });

  it.each(["postgres", "mysql", "sqlite"] as const)(
    "keeps lossless date editing available for %s",
    (engine) => {
      const table: TableMetadata = {
        ...EDITABLE_TABLE,
        columns: [
          ...columns,
          {
            name: "calendar_date",
            dataType: "date",
            nullable: true,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      };
      const result = computeTableEditability(table, WRITABLE_CAPABILITIES, engine);
      expect(result.editableColumns.has("calendar_date")).toBe(true);
      expect(result.insertableColumns.has("calendar_date")).toBe(true);
    }
  );
});

describe("computeTableEditability insert gating (F104)", () => {
  it("allows insert with full write access, including the primary key and structured columns", () => {
    const result = computeTableEditability(EDITABLE_TABLE, WRITABLE_CAPABILITIES, "postgres");
    expect(result.canInsert).toBe(true);
    expect(result.insertableColumns.has("id")).toBe(true);
    expect(result.insertableColumns.has("name")).toBe(true);
    expect(result.insertableColumns.has("tags")).toBe(true);
  });

  it("allows insert independently of update permission", () => {
    const insertOnly: TableMetadata = {
      ...EDITABLE_TABLE,
      permissions: { select: true, insert: true, update: false, delete: false }
    };
    const result = computeTableEditability(insertOnly, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(false);
    expect(result.canInsert).toBe(true);
    expect(result.insertableColumns.has("id")).toBe(true);
  });

  it("disables insert when the table lacks insert permission, independently of update", () => {
    const updateOnly: TableMetadata = {
      ...EDITABLE_TABLE,
      permissions: { select: true, insert: false, update: true, delete: false }
    };
    const result = computeTableEditability(updateOnly, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(true);
    expect(result.canInsert).toBe(false);
    expect(result.insertReason).toMatch(/permission/i);
    expect(result.insertableColumns.size).toBe(0);
  });

  it("uses Add row for MongoDB and permits an optional _id", () => {
    const result = computeTableEditability(EDITABLE_COLLECTION, WRITABLE_CAPABILITIES, "mongodb");
    expect(result.canInsert).toBe(true);
    expect(result.insertableColumns).toEqual(new Set(["_id", "name", "profile"]));
  });

  it("disables insert for a view, with the same reason as editing", () => {
    const view: TableMetadata = { ...EDITABLE_TABLE, kind: "view" };
    const result = computeTableEditability(view, WRITABLE_CAPABILITIES, "postgres");
    expect(result.canInsert).toBe(false);
    expect(result.insertReason).toMatch(/view/i);
  });

  it("disables insert for a table with no primary key", () => {
    const noPk: TableMetadata = {
      ...EDITABLE_TABLE,
      columns: columns.map((column) => ({ ...column, isPrimaryKey: false }))
    };
    const result = computeTableEditability(noPk, WRITABLE_CAPABILITIES, "postgres");
    expect(result.canInsert).toBe(false);
    expect(result.insertReason).toMatch(/primary key/i);
  });

  it("disables insert for a read-only session", () => {
    const readOnly: ConnectionCapabilities = {
      ...WRITABLE_CAPABILITIES,
      supportsRowMutations: false,
      readOnlyReason: "qyre-flag"
    };
    const result = computeTableEditability(EDITABLE_TABLE, readOnly, "postgres");
    expect(result.canInsert).toBe(false);
    expect(result.insertReason).toMatch(/--read-only/);
  });
});

describe("computeTableEditability delete gating (F105)", () => {
  it("allows delete with full write access", () => {
    const result = computeTableEditability(EDITABLE_TABLE, WRITABLE_CAPABILITIES, "postgres");
    expect(result.canDelete).toBe(true);
  });

  it("allows delete independently of update/insert permission", () => {
    const deleteOnly: TableMetadata = {
      ...EDITABLE_TABLE,
      permissions: { select: true, insert: false, update: false, delete: true }
    };
    const result = computeTableEditability(deleteOnly, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(false);
    expect(result.canInsert).toBe(false);
    expect(result.canDelete).toBe(true);
  });

  it("disables delete when the table lacks delete permission, independently of update/insert", () => {
    const noDelete: TableMetadata = {
      ...EDITABLE_TABLE,
      permissions: { select: true, insert: true, update: true, delete: false }
    };
    const result = computeTableEditability(noDelete, WRITABLE_CAPABILITIES, "postgres");
    expect(result.editable).toBe(true);
    expect(result.canInsert).toBe(true);
    expect(result.canDelete).toBe(false);
  });

  it("uses shared row selection and staged delete for MongoDB", () => {
    const result = computeTableEditability(EDITABLE_COLLECTION, WRITABLE_CAPABILITIES, "mongodb");
    expect(result.canDelete).toBe(true);
  });

  it("disables delete for a view", () => {
    const view: TableMetadata = { ...EDITABLE_TABLE, kind: "view" };
    const result = computeTableEditability(view, WRITABLE_CAPABILITIES, "postgres");
    expect(result.canDelete).toBe(false);
  });

  it("disables delete for a table with no primary key", () => {
    const noPk: TableMetadata = {
      ...EDITABLE_TABLE,
      columns: columns.map((column) => ({ ...column, isPrimaryKey: false }))
    };
    const result = computeTableEditability(noPk, WRITABLE_CAPABILITIES, "postgres");
    expect(result.canDelete).toBe(false);
  });

  it("disables delete for a read-only session", () => {
    const readOnly: ConnectionCapabilities = {
      ...WRITABLE_CAPABILITIES,
      supportsRowMutations: false,
      readOnlyReason: "qyre-flag"
    };
    const result = computeTableEditability(EDITABLE_TABLE, readOnly, "postgres");
    expect(result.canDelete).toBe(false);
  });
});

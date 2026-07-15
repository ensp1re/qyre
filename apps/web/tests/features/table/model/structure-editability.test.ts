import type { ColumnMetadata, ConnectionCapabilities, TableMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { computeTableStructureEditability } from "../../../../src/features/table/model/structure/structure-editability.js";

const FULL_CAPABILITIES: ConnectionCapabilities = {
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
  { name: "id", dataType: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false }
];

const TABLE: TableMetadata = { schema: "public", name: "orders", kind: "table", columns };
const COLLECTION: TableMetadata = { schema: "test", name: "orders", kind: "collection", columns };

describe("computeTableStructureEditability (F114)", () => {
  it("allows every control on a SQL table when the session has both DDL capabilities", () => {
    expect(computeTableStructureEditability(TABLE, FULL_CAPABILITIES, "postgres")).toEqual({
      canEditColumns: true,
      canManageIndexes: true,
      canEditTable: true
    });
  });

  it("hides column controls on MongoDB even though supportsDdl allows the table itself", () => {
    expect(computeTableStructureEditability(COLLECTION, FULL_CAPABILITIES, "mongodb")).toEqual({
      canEditColumns: false,
      canManageIndexes: true,
      canEditTable: true
    });
  });

  it("gates canEditColumns/canEditTable and canManageIndexes independently", () => {
    const ddlOnly: ConnectionCapabilities = {
      ...FULL_CAPABILITIES,
      supportsIndexManagement: false
    };
    expect(computeTableStructureEditability(TABLE, ddlOnly, "postgres")).toEqual({
      canEditColumns: true,
      canManageIndexes: false,
      canEditTable: true
    });

    const indexOnly: ConnectionCapabilities = { ...FULL_CAPABILITIES, supportsDdl: false };
    expect(computeTableStructureEditability(TABLE, indexOnly, "postgres")).toEqual({
      canEditColumns: false,
      canManageIndexes: true,
      canEditTable: false
    });
  });

  it("disables everything for a view - structure DDL has nothing to alter", () => {
    const view: TableMetadata = { ...TABLE, kind: "view" };
    expect(computeTableStructureEditability(view, FULL_CAPABILITIES, "postgres")).toEqual({
      canEditColumns: false,
      canManageIndexes: false,
      canEditTable: false
    });
  });

  it("disables everything for a materialized view", () => {
    const matview: TableMetadata = { ...TABLE, kind: "materialized-view" };
    expect(computeTableStructureEditability(matview, FULL_CAPABILITIES, "postgres")).toEqual({
      canEditColumns: false,
      canManageIndexes: false,
      canEditTable: false
    });
  });

  it("disables everything for a read-only session", () => {
    const readOnly: ConnectionCapabilities = {
      ...FULL_CAPABILITIES,
      supportsDdl: false,
      supportsIndexManagement: false,
      readOnlyReason: "qyre-flag"
    };
    expect(computeTableStructureEditability(TABLE, readOnly, "postgres")).toEqual({
      canEditColumns: false,
      canManageIndexes: false,
      canEditTable: false
    });
  });

  it("disables everything when the table hasn't loaded yet", () => {
    expect(computeTableStructureEditability(undefined, FULL_CAPABILITIES, "postgres")).toEqual({
      canEditColumns: false,
      canManageIndexes: false,
      canEditTable: false
    });
  });
});

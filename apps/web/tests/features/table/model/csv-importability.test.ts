import type { ConnectionCapabilities, DatabaseEngine, TableMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { computeCsvImportability } from "../../../../src/features/table/model/transfer/csv-importability.js";

const capabilities: ConnectionCapabilities = {
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

function target(engine: DatabaseEngine): TableMetadata {
  return {
    schema: engine === "mongodb" ? "app" : "public",
    name: "users",
    kind: engine === "mongodb" ? "collection" : "table",
    columns: [
      {
        name: "name",
        dataType: engine === "mongodb" ? "string" : "varchar",
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false
      },
      {
        name: "payload",
        dataType: engine === "mongodb" ? "object" : "jsonb",
        nullable: true,
        isPrimaryKey: false,
        isForeignKey: false
      }
    ],
    permissions: { select: true, insert: true, update: false, delete: false }
  };
}

describe("computeCsvImportability", () => {
  it.each(["postgres", "mysql", "sqlite", "mongodb"] as const)(
    "allows scalar insert mapping on %s without requiring a primary key",
    (engine) => {
      const result = computeCsvImportability(target(engine), capabilities, engine);
      expect(result.canImport).toBe(true);
      expect(result.columns.map((column) => column.name)).toEqual(["name"]);
    }
  );

  it("fails closed for views, missing insert permission, and read-only capabilities", () => {
    const table = target("postgres");
    expect(
      computeCsvImportability({ ...table, kind: "view" }, capabilities, "postgres").canImport
    ).toBe(false);
    expect(
      computeCsvImportability(
        { ...table, permissions: { select: true, insert: false, update: true, delete: true } },
        capabilities,
        "postgres"
      ).canImport
    ).toBe(false);
    expect(
      computeCsvImportability(
        table,
        { ...capabilities, supportsRowMutations: false, readOnlyReason: "qyre-flag" },
        "postgres"
      ).canImport
    ).toBe(false);
  });
});

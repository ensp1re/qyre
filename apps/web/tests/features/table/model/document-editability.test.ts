import type { ColumnMetadata, ConnectionCapabilities, TableMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { computeDocumentEditability } from "../../../../src/features/table/model/document-editability.js";

const WRITABLE_CAPABILITIES: ConnectionCapabilities = {
  supportsSql: false,
  supportsRowMutations: true,
  supportsDdl: true,
  supportsIndexManagement: false,
  supportsDatabaseManagement: true,
  supportsTransactions: false,
  readOnlyReason: null
};

const columns: ColumnMetadata[] = [
  { name: "_id", dataType: "objectId", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "string", nullable: false, isPrimaryKey: false, isForeignKey: false }
];

const EDITABLE_COLLECTION: TableMetadata = {
  schema: "test",
  name: "users",
  kind: "collection",
  columns,
  permissions: { select: true, insert: true, update: true, delete: true }
};

describe("computeDocumentEditability (F125)", () => {
  it("allows edit/insert/delete with full write access on a collection", () => {
    const result = computeDocumentEditability(
      EDITABLE_COLLECTION,
      WRITABLE_CAPABILITIES,
      "mongodb"
    );
    expect(result).toEqual({ canEdit: true, canInsert: true, canDelete: true });
  });

  it("each affordance is gated independently by its own permission", () => {
    const editOnly: TableMetadata = {
      ...EDITABLE_COLLECTION,
      permissions: { select: true, insert: false, update: true, delete: false }
    };
    const result = computeDocumentEditability(editOnly, WRITABLE_CAPABILITIES, "mongodb");
    expect(result).toEqual({ canEdit: true, canInsert: false, canDelete: false });
  });

  it("disables everything for a non-MongoDB engine - this is MongoDB's own editing surface", () => {
    const result = computeDocumentEditability(
      EDITABLE_COLLECTION,
      WRITABLE_CAPABILITIES,
      "postgres"
    );
    expect(result).toEqual({ canEdit: false, canInsert: false, canDelete: false });
  });

  it("disables everything for a Mongo view", () => {
    const view: TableMetadata = { ...EDITABLE_COLLECTION, kind: "view" };
    const result = computeDocumentEditability(view, WRITABLE_CAPABILITIES, "mongodb");
    expect(result).toEqual({ canEdit: false, canInsert: false, canDelete: false });
  });

  it("disables everything for a read-only session", () => {
    const readOnly: ConnectionCapabilities = {
      ...WRITABLE_CAPABILITIES,
      supportsRowMutations: false,
      readOnlyReason: "qyre-flag"
    };
    const result = computeDocumentEditability(EDITABLE_COLLECTION, readOnly, "mongodb");
    expect(result).toEqual({ canEdit: false, canInsert: false, canDelete: false });
  });

  it("disables everything when the table hasn't loaded yet", () => {
    const result = computeDocumentEditability(undefined, WRITABLE_CAPABILITIES, "mongodb");
    expect(result).toEqual({ canEdit: false, canInsert: false, canDelete: false });
  });
});

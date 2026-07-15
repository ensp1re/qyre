import type { ConnectionCapabilities } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { databaseManagementReason } from "../../../../src/features/connection/model/admin/database-management-reason.js";

const WRITABLE: ConnectionCapabilities = {
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

describe("databaseManagementReason (F116)", () => {
  it("returns undefined when the session can manage databases", () => {
    expect(databaseManagementReason(WRITABLE)).toBeUndefined();
  });

  it("returns undefined when capabilities haven't loaded yet", () => {
    expect(databaseManagementReason(undefined)).toBeUndefined();
  });

  it("uses the shared read-only reason label when the whole session is read-only", () => {
    expect(databaseManagementReason({ ...WRITABLE, readOnlyReason: "qyre-flag" })).toBe(
      "Read-only: qyre --read-only flag"
    );
  });

  it("falls back to a database-management-specific reason when only that capability is missing", () => {
    expect(databaseManagementReason({ ...WRITABLE, supportsDatabaseManagement: false })).toBe(
      "Your database role doesn't have database-management privileges."
    );
  });
});

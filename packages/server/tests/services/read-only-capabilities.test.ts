import type { ConnectionCapabilities } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { applyReadOnlyOverride } from "../../src/services/access/read-only-capabilities.js";

const writable: ConnectionCapabilities = {
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

describe("applyReadOnlyOverride (F096)", () => {
  it("passes capabilities through unchanged when not read-only", () => {
    expect(applyReadOnlyOverride(writable, false)).toEqual(writable);
  });

  it("forces every capability false and readOnlyReason to 'qyre-flag' when read-only", () => {
    expect(applyReadOnlyOverride(writable, true)).toEqual({
      supportsSql: true,
      rowExportFormats: ["csv", "json", "sql"],
      jsonExportMode: "json",
      supportsAccessInspection: true,
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "qyre-flag"
    });
  });

  it("wins over an already-restricted 'grants' reason - qyre-flag always takes precedence", () => {
    const grantsRestricted: ConnectionCapabilities = { ...writable, readOnlyReason: "grants" };
    expect(applyReadOnlyOverride(grantsRestricted, true).readOnlyReason).toBe("qyre-flag");
  });

  it("preserves engine-level SQL and export facts", () => {
    const mongoLike: ConnectionCapabilities = {
      ...writable,
      supportsSql: false,
      rowExportFormats: ["csv", "json"],
      jsonExportMode: "extended-json",
      supportsAccessInspection: true
    };
    expect(applyReadOnlyOverride(mongoLike, true)).toMatchObject({
      supportsSql: false,
      rowExportFormats: ["csv", "json"],
      jsonExportMode: "extended-json",
      supportsAccessInspection: true
    });
  });
});

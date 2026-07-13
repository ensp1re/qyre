import { describe, expect, it } from "vitest";
import { stubReadOnlyCapabilities } from "../src/capabilities.js";

describe("stubReadOnlyCapabilities", () => {
  it("reports every write flag false and readOnlyReason grants", () => {
    expect(stubReadOnlyCapabilities(true)).toEqual({
      supportsSql: true,
      rowExportFormats: ["csv", "json", "sql"],
      jsonExportMode: "json",
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "grants"
    });
  });

  it("passes supportsSql through unchanged", () => {
    expect(stubReadOnlyCapabilities(false)).toMatchObject({
      supportsSql: false,
      rowExportFormats: ["csv", "json"],
      jsonExportMode: "extended-json"
    });
  });
});

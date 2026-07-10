import { describe, expect, it } from "vitest";
import { stubReadOnlyCapabilities } from "./capabilities.js";

describe("stubReadOnlyCapabilities", () => {
  it("reports every write flag false and readOnlyReason grants", () => {
    expect(stubReadOnlyCapabilities(true)).toEqual({
      supportsSql: true,
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "grants"
    });
  });

  it("passes supportsSql through unchanged", () => {
    expect(stubReadOnlyCapabilities(false).supportsSql).toBe(false);
  });
});
